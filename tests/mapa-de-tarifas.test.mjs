import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['services/mapaDeTarifas.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {gravarDiaNoBanco}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

// Banco de mentira: uma tabela room_types com o mesmo jeito de chamar do Supabase.
function bancoDeTeste(linhas,{erroAoLer=null,erroAoGravar=null}={}){
  const pedidos=[];
  const banco={
    from(tabela){
      assert.equal(tabela,'room_types');
      return {
        select(colunas){
          return {eq(coluna,valor){
            return {async single(){
              pedidos.push({op:'ler',colunas,coluna,valor});
              if(erroAoLer) return {data:null,error:erroAoLer};
              const linha=linhas.find(l=>l.id===valor);
              return linha?{data:structuredClone(linha),error:null}:{data:null,error:{message:'0 rows'}};
            }};
          }};
        },
        update(valores){
          return {async eq(coluna,valor){
            pedidos.push({op:'gravar',valores:structuredClone(valores),coluna,valor});
            if(erroAoGravar) return {error:erroAoGravar};
            Object.assign(linhas.find(l=>l.id===valor),structuredClone(valores));
            return {error:null};
          }};
        },
      };
    },
  };
  return {banco,pedidos,linhas};
}

const loft=()=>({id:'loft',name:'LOFT',base_price:910,total_quantity:2,overrides:[
  {dateIso:'2026-11-17',price:9,availableQuantity:0,isClosed:false},
  {dateIso:'2026-11-20',price:1650,availableQuantity:1,isClosed:false},
]});

test('parte do que está no banco e muda só o campo pedido daquele dia',async()=>{
  const t=bancoDeTeste([loft()]);
  const lista=await gravarDiaNoBanco(t.banco,'loft','2026-11-17',{price:910});
  assert.deepEqual(lista,[
    {dateIso:'2026-11-17',price:910,availableQuantity:0,isClosed:false},
    {dateIso:'2026-11-20',price:1650,availableQuantity:1,isClosed:false},
  ]);
  assert.deepEqual(t.linhas[0].overrides,lista,'o estoque baixado pelas reservas continua como estava');
  assert.deepEqual(t.pedidos.map(p=>p.op),['ler','gravar']);
});

test('grava só a lista de ajustes daquela acomodação',async()=>{
  const t=bancoDeTeste([loft(),{id:'casal',name:'Suíte Casal',base_price:410,total_quantity:10,overrides:[]}]);
  await gravarDiaNoBanco(t.banco,'casal','2026-12-05',{price:610});
  const gravacao=t.pedidos.find(p=>p.op==='gravar');
  assert.deepEqual(Object.keys(gravacao.valores),['overrides'],'nome, fotos, tarifa base e total não vão junto');
  assert.equal(gravacao.coluna,'id'); assert.equal(gravacao.valor,'casal');
  assert.deepEqual(t.linhas[1].overrides,[{dateIso:'2026-12-05',price:610,availableQuantity:10,isClosed:false}]);
  assert.deepEqual(t.linhas[0],loft(),'a outra acomodação não é tocada');
});

test('duas gravações seguidas: a segunda já vê a primeira',async()=>{
  const t=bancoDeTeste([loft()]);
  await gravarDiaNoBanco(t.banco,'loft','2026-11-17',{price:910});
  await gravarDiaNoBanco(t.banco,'loft','2026-11-18',{price:950});
  assert.deepEqual(t.linhas[0].overrides.map(a=>[a.dateIso,a.price]),
    [['2026-11-17',910],['2026-11-20',1650],['2026-11-18',950]]);
});

test('estoque baixado entre uma gravação e outra não é desfeito',async()=>{
  const t=bancoDeTeste([loft()]);
  await gravarDiaNoBanco(t.banco,'loft','2026-11-20',{price:1700});
  // Uma reserva entra e o gatilho do banco baixa o estoque do dia 20 para 0.
  t.linhas[0].overrides.find(a=>a.dateIso==='2026-11-20').availableQuantity=0;
  await gravarDiaNoBanco(t.banco,'loft','2026-11-17',{price:910});
  assert.equal(t.linhas[0].overrides.find(a=>a.dateIso==='2026-11-20').availableQuantity,0);
});

test('falha ao ler ou ao gravar sobe como erro, e nada é gravado pela metade',async()=>{
  const semLinha=bancoDeTeste([]);
  await assert.rejects(()=>gravarDiaNoBanco(semLinha.banco,'loft','2026-11-17',{price:910}));
  assert.equal(semLinha.pedidos.filter(p=>p.op==='gravar').length,0);

  const leituraRuim=bancoDeTeste([loft()],{erroAoLer:{message:'timeout'}});
  await assert.rejects(()=>gravarDiaNoBanco(leituraRuim.banco,'loft','2026-11-17',{price:910}),e=>e.message==='timeout');
  assert.equal(leituraRuim.pedidos.filter(p=>p.op==='gravar').length,0);

  const gravacaoRuim=bancoDeTeste([loft()],{erroAoGravar:{message:'sem permissão'}});
  await assert.rejects(()=>gravarDiaNoBanco(gravacaoRuim.banco,'loft','2026-11-17',{price:910}),e=>e.message==='sem permissão');
  assert.deepEqual(gravacaoRuim.linhas[0],loft());
});
