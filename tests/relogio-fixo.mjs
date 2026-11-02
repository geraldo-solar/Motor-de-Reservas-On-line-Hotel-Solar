// Relógio dos testes que usam datas fixas de 2026 e 2027.
//
// Esses testes cotam datas como 20/09/2026 ou o Réveillon 2026/27. Com o
// relógio real, cada data vira "período que já passou" quando o calendário
// a alcança: em 02/11/2026 eram 12 testes vencidos, e em janeiro mais 26
// venceriam com o Réveillon. Importado primeiro no arquivo, este módulo põe
// o "agora" em 05/09/2026, 10h de Belém, o mesmo instante que vários testes
// já usam, e deixa o tempo andar a partir dali (intervalos e prazos de 30
// minutos continuam se comportando como no relógio real).
//
// Testes que controlam o próprio relógio com t.mock.timers continuam
// funcionando: o mock substitui este Date e o devolve ao terminar.

const AGORA_DOS_TESTES = Date.parse('2026-09-05T10:00:00-03:00');
const DataReal = Date;
const desvio = AGORA_DOS_TESTES - DataReal.now();

class DataDosTestes extends DataReal {
  constructor(...args) {
    super(...(args.length ? args : [DataReal.now() + desvio]));
  }
  static now() {
    return DataReal.now() + desvio;
  }
}

globalThis.Date = DataDosTestes;
