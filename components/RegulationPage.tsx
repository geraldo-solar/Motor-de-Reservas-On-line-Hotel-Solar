import React from 'react';
import { ChevronLeft } from 'lucide-react';

export const RegulationPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12 animate-in fade-in duration-500">
            <button onClick={onBack} className="mb-8 flex items-center gap-2 text-solar-green hover:text-solar-gold transition-colors">
                <ChevronLeft size={20} />
                <span className="text-sm font-bold uppercase tracking-widest">Voltar</span>
            </button>

            <div className="bg-white rounded-3xl shadow-2xl border border-solar-gold/10 overflow-hidden">
                <div className="bg-solar-green p-8 text-center">
                    <img src="/logo-gold.png" alt="Hotel Solar" className="h-20 mx-auto mb-4" />
                    <h1 className="text-2xl md:text-3xl font-serif text-solar-gold">🌞 Política de Reservas, Cancelamento e Regras de Estada</h1>
                    <p className="text-solar-sand/80 mt-2">Hotel Solar – Salinópolis (PA)</p>
                </div>

                <div className="p-6 md:p-10 space-y-8 text-slate-700">
                    <p className="text-center italic text-slate-600">Pensamos cada detalhe do Hotel Solar para proporcionar descanso, bem-estar e conexão com a natureza. Algumas orientações são importantes para garantir uma experiência harmoniosa para todos os hóspedes.</p>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🕑 Horários & Condições de Hospedagem</h2>
                        <ul className="space-y-2">
                            <li><strong>Check-in:</strong> a partir das 14h</li>
                            <li><strong>Check-out:</strong> até as 12h</li>
                        </ul>
                        <div className="mt-4 space-y-3">
                            <div>
                                <strong>Early Check-in:</strong>
                                <ul className="list-disc ml-6 mt-1 text-sm">
                                    <li>Mediante disponibilidade, será cobrada meia diária a partir das 06h.</li>
                                    <li>Antes desse horário, será cobrada diária inteira.</li>
                                </ul>
                            </div>
                            <div>
                                <strong>Late Check-out:</strong>
                                <ul className="list-disc ml-6 mt-1 text-sm">
                                    <li>Até 18h: cobrança de meia diária.</li>
                                    <li>Após esse horário: cobrança de diária inteira.</li>
                                </ul>
                            </div>
                        </div>
                        <p className="mt-4 bg-solar-gold/10 p-3 rounded-lg text-sm">🔔 O saldo restante (50%) das diárias deverá ser quitado no momento do check-in.</p>
                        <p className="mt-2 text-sm text-slate-500">As reservas são distribuídas conforme a disponibilidade dos apartamentos, não sendo possível garantir um número ou unidade específica.</p>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">❌ Política de Cancelamento e No-Show</h2>
                        <div className="space-y-4">
                            <div>
                                <strong>No-show (não comparecimento):</strong>
                                <p className="text-sm mt-1">O não comparecimento sem comunicação prévia por escrito, na data prevista de chegada, será considerado no-show. A acomodação ficará disponível por até 24 horas a partir do horário de check-in. Após esse período, a reserva será cancelada, com retenção de 100% do valor pago, sem direito a restituição.</p>
                            </div>
                            <div>
                                <strong>Desistência após a entrada ou saída antecipada:</strong>
                                <p className="text-sm mt-1">A desistência da estada na chegada ou após o check-in, bem como a saída antecipada por qualquer motivo, inclusive caso fortuito ou força maior, não dará direito a reembolso, restituição em dinheiro ou conversão em crédito para futuras diárias, acarretando a perda total do valor pago.</p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">👨‍👩‍👧 Crianças e Responsabilidade</h2>
                        <ul className="list-disc ml-6 space-y-1 text-sm">
                            <li>Crianças até 6 anos (06) são free, limitado a 01 criança por apartamento.</li>
                            <li>É obrigatória a comprovação de parentesco mediante documento válido com foto.</li>
                        </ul>
                        <p className="mt-3 bg-yellow-50 p-3 rounded-lg text-sm">⚠️ O Hotel Solar não dispõe de serviço de monitoria infantil. A responsabilidade pela guarda e segurança das crianças, nas áreas internas ou externas, é exclusivamente dos pais ou responsáveis.</p>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🧹 Arrumação & Enxoval</h2>
                        <p className="text-sm mb-2">🌿 Por compromisso com a sustentabilidade:</p>
                        <ul className="list-disc ml-6 space-y-1 text-sm">
                            <li>Troca de roupas de cama a cada 3 dias</li>
                            <li>Troca de toalhas de banho diariamente</li>
                        </ul>
                        <p className="mt-2 text-sm text-slate-500">Não realizamos arrumação ou troca de toalhas na diária de saída. Caso necessário, este serviço poderá ser contratado à parte na recepção.</p>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🧊 Frigobar</h2>
                        <p className="text-sm">O frigobar será entregue vazio e desligado no check-in. Cada hóspede pode acioná-lo internamente e realizar o abastecimento conforme sua preferência.</p>
                        <p className="mt-2 text-sm text-red-600">🚫 Não aceitamos devolução de produtos armazenados no frigobar.</p>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🍽️ Alimentação & Consumo</h2>
                        <ul className="list-disc ml-6 space-y-1 text-sm">
                            <li><strong>Café da manhã:</strong> cortesia para hóspedes, servido das 07h às 10h, em nosso restaurante.</li>
                            <li>As demais refeições são à la carte.</li>
                        </ul>
                        <p className="mt-2 text-sm text-slate-500">Durante a estada, todo consumo deverá ser assinado em comanda e quitado no momento do check-out.</p>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🔊 Convivência & Bem-Estar</h2>
                        <ul className="list-disc ml-6 space-y-1 text-sm">
                            <li>Para preservar o conforto acústico e o descanso de todos, não é permitido o uso de caixas de som portáteis nos apartamentos ou áreas comuns.</li>
                            <li><strong>Piscinas:</strong> funcionamento das 10h às 22h. Pedimos atenção especial ao uso consciente, especialmente no período noturno.</li>
                        </ul>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🍾 Consumo Externo & Rolha</h2>
                        <p className="text-sm">Não é permitido o consumo de bebidas, alimentos ou lanches não adquiridos no hotel nas áreas sociais (piscinas, bares, restaurante, sala de estar, etc.). Este consumo é permitido apenas no interior dos apartamentos.</p>
                        <p className="mt-2 text-sm font-medium">➡️ Cobramos taxa de rolha.</p>
                    </div>

                    <div className="border-t border-slate-200 pt-6">
                        <h2 className="text-xl font-bold text-solar-green mb-4">🧾 Taxa de Serviço</h2>
                        <p className="text-sm">É cobrada taxa de serviço de 10%, destinada ao fundo de gratificação dos colaboradores.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
