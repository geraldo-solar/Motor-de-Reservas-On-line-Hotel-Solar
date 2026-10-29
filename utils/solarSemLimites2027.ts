/** Solar Sem Limites 2027: orientação da IA durante o lançamento (decisão de
 * Geraldo em 29/10/2026, antes do convite pelo WhatsApp de 30/10).
 *
 * A IA não vende nem detalha o pacote: antes da abertura convida para a Lista
 * VIP e para a visita guiada ao vivo; com as vendas abertas, leva à página de
 * vendas e à equipe. Preço, pagamento, validade e regras do pacote ficam com a
 * página, o regulamento e a equipe, para nada sair diferente do regulamento
 * (versão 2026-10-10). Isto informa o assistente; não muda tarifas, estoque,
 * reservas nem a cotação.
 */
export const solarSemLimites2027 = {
  confirmed_at: '2026-10-29',
  visita_guiada: '2026-11-24T19:00:00-03:00',
  abertura: '2026-11-25T08:00:00-03:00',
  encerramento: '2026-12-01T23:59:59-03:00',
  lista_vip: 'https://www.hotelsolar.tur.br/vip',
  pagina_de_vendas: 'https://www.hotelsolar.tur.br/solarsemlimites2027',
  regulamento: 'https://www.hotelsolar.tur.br/solarsemlimites2026/Regulamento_SSL.pdf',
};

const em = (iso: string) => Date.parse(iso);

const naoInventar = 'Não informe nem estime preço, forma de pagamento, parcelamento, desconto, validade, datas de uso, disponibilidade ou regras do pacote Solar Sem Limites 2027, nem faça cotação, reserva ou pré-reserva dele: a regra de parcelamento das reservas comuns não vale para este pacote. Se o cliente citar um valor ou condição, não confirme nem corrija: diga que a equipe confirma.';
const semPressao = 'Tom de convite, acolhedor e sem pressão. Não use escassez nem urgência (últimas vagas, restam, corra, só hoje) e não use as palavras sem juros, desconto, sorteio ou ilimitado para este pacote. Não prometa revoada de guarás, maré ou clima.';
const indicacao = 'Quem está na Lista VIP recebe um link pessoal para convidar família e amigos; as regras da indicação estão no item 10 do regulamento. Não explique o prêmio da indicação além disso: a equipe tira as dúvidas.';
const equipe = 'Se o cliente insistir em detalhes do pacote ou quiser comprar, ofereça falar com a equipe, que responde nesta conversa, sem afirmar encaminhamento concluído.';

/** Política do lançamento para o contexto da IA, conforme a fase pela hora atual. */
export function solarSemLimites2027Policy(now = Date.now()) {
  const comum = {
    confirmado_pelo_responsavel_em: solarSemLimites2027.confirmed_at,
    o_que_e: 'Solar Sem Limites 2027 é o lançamento do Hotel Solar para quem quer voltar mais vezes à sua casa na praia.',
    nao_inventar: naoInventar,
    tom: semPressao,
    atendimento: equipe,
  };
  if (now < em(solarSemLimites2027.abertura)) {
    return {
      ...comum,
      fase: 'antes_da_abertura',
      datas: 'Visita guiada ao vivo pelo hotel em 24/11, às 19h. As vendas abrem em 25/11, às 8h, e encerram em 01/12, às 23h59 (horário de Belém).',
      como_responder: 'Explique que as condições serão apresentadas com calma na visita guiada ao vivo de 24/11, às 19h, e que quem entra na Lista VIP recebe o convite para a visita, conhece as condições antes da abertura e é avisado em 25/11, às 8h, quando as vendas abrem.',
      como_entrar_na_lista_vip: `Quem recebeu o convite pode tocar no botão "Entrar na Lista VIP". Também pode escrever aqui "Quero entrar na Lista VIP" ou entrar pelo site ${solarSemLimites2027.lista_vip}. Não diga que a pessoa já entrou na lista: a confirmação vem na mensagem do hotel.`,
      indicacao,
    };
  }
  if (now <= em(solarSemLimites2027.encerramento)) {
    return {
      ...comum,
      fase: 'vendas_abertas',
      datas: 'As vendas estão abertas até 01/12, às 23h59 (horário de Belém).',
      como_responder: `Convide para conhecer as condições e comprar pela página ${solarSemLimites2027.pagina_de_vendas}, onde estão o regulamento e as formas de pagamento, ou para falar com a equipe nesta conversa.`,
      indicacao,
    };
  }
  return {
    ...comum,
    fase: 'encerrado',
    como_responder: 'As vendas do Solar Sem Limites 2027 foram encerradas em 01/12. Para quem já comprou, reservas e dúvidas do pacote seguem com a equipe nesta conversa.',
  };
}
