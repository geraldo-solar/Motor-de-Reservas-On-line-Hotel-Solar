// Quanto falta para um pacote começar, em datas locais no formato YYYY-MM-DD.
//
// Só vira chamada de urgência dentro de 30 dias: nos feriados de 2026, de 51% a
// 71% dos quartos foram vendidos na última semana e cerca de 90% no último mês.
// Antes disso, "faltam 95 dias" não empurra ninguém, então não mostra nada.
export const contagemRegressiva = (inicioIso: string | undefined, hojeIso: string): string => {
  if (!inicioIso || !hojeIso) return '';
  const paraData = (iso: string) => {
    const [ano, mes, dia] = iso.split('-').map(Number);
    return new Date(ano, mes - 1, dia);
  };
  const dias = Math.round((paraData(inicioIso).getTime() - paraData(hojeIso).getTime()) / 86400000);
  if (Number.isNaN(dias)) return '';
  if (dias < 0) return 'Acontecendo agora';
  if (dias === 0) return 'Começa hoje';
  if (dias === 1) return 'Começa amanhã';
  if (dias <= 30) return `Faltam ${dias} dias`;
  return '';
};
