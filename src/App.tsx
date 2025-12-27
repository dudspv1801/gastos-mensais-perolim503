import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, 
  Trash2, 
  Users, 
  Receipt, 
  PiggyBank, 
  Download, 
  Loader2,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

// Firebase Imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';

// --- Interfaces de Tipos ---
type BillType = 'rent' | 'shared' | 'parking' | 'individual' | 'house_supplies';

interface Resident {
  id: string;
  name: string;
  index: number;
  rentWeight: number;
}

interface Bill {
  id: string;
  description: string;
  budgetedValue: number; // Valor cobrado dos moradores
  actualValue: number;   // Valor real pago na fatura
  createdAt: number;
  type: BillType;
  monthId: string;
  isPaid: boolean;
  paidAt?: number;
  targetResidentId?: string;
}

interface ReceiptStatus {
  id: string; 
  residentId: string;
  monthId: string;
  received: boolean;
  receivedAt?: number;
}

// --- Configuração do Firebase Oficial ---
const firebaseConfig = {
  apiKey: "AIzaSyBJDYaUNTJjkW46FV0kBaameQyJ1JHr6u8",
  authDomain: "gestor-de-contas-b546e.firebaseapp.com",
  projectId: "gestor-de-contas-b546e",
  storageBucket: "gestor-de-contas-b546e.firebasestorage.app",
  messagingSenderId: "980131809506",
  appId: "1:980131809506:web:7ef3e90c1853bdf12d36bb"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Atualizado o ID para v7 para suportar a nova estrutura de Budgeted vs Actual
const APTO_ID = 'apartamento-excedentes-v7';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [receipts, setReceipts] = useState<ReceiptStatus[]>([]);
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const currentMonthId = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedDate]);

  const [newBill, setNewBill] = useState({ 
    description: '', budgetedValue: '', actualValue: '', type: 'shared' as BillType, targetId: 'all'
  });

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        try { await signInAnonymously(auth); } catch (e) { console.error(e); }
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Data Sync
  useEffect(() => {
    if (!user) return;
    const billsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'bills');
    const residentsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'residents');
    const receiptsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'receipts');

    const unsubBills = onSnapshot(billsRef, (s) => {
      const data = s.docs.map(d => ({ ...d.data(), id: d.id } as Bill));
      setAllBills(data.sort((a, b) => b.createdAt - a.createdAt));
    });

    const unsubResidents = onSnapshot(residentsRef, (s) => {
      const data = s.docs.map(d => ({ ...d.data(), id: d.id } as Resident));
      if (data.length === 0) setupDefaultResidents();
      else setResidents(data.sort((a, b) => a.index - b.index));
    });

    const unsubReceipts = onSnapshot(receiptsRef, (s) => 
      setReceipts(s.docs.map(d => ({ ...d.data(), id: d.id } as ReceiptStatus)))
    );

    return () => { unsubBills(); unsubResidents(); unsubReceipts(); };
  }, [user]);

  const setupDefaultResidents = async () => {
    const residentsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'residents');
    const defaults = [
      { name: "Eduardo", weight: 1.0 }, { name: "Menon", weight: 1.0 }, { name: "Lucas", weight: 1.0 },
      { name: "Camila", weight: 0.65 }, { name: "Júlia", weight: 0.65 }, { name: "Saulo", weight: 0.60 }
    ];
    for (let i = 0; i < defaults.length; i++) {
      await addDoc(residentsRef, { name: defaults[i].name, rentWeight: defaults[i].weight, index: i });
    }
  };

  const bills = useMemo(() => allBills.filter(b => b.monthId === currentMonthId), [allBills, currentMonthId]);

  // --- Cálculos Matemáticos ---
  
  // A Caixinha agora é o somatório de (Cobrado - Pago) de TODAS as contas de TODOS os meses
  const caixinhaBalance = useMemo(() => {
    return allBills.reduce((acc, b) => acc + (Number(b.budgetedValue) - Number(b.actualValue)), 0);
  }, [allBills]);

  const totals = useMemo(() => {
    const totalWeight = residents.reduce((acc, r) => acc + (Number(r.rentWeight) || 0), 0);
    
    // O que é rateado é sempre o BUDGETED (o que você decidiu cobrar)
    const totalRentBudgeted = bills.filter(b => b.type === 'rent').reduce((acc, b) => acc + Number(b.budgetedValue), 0);
    const totalSharedBudgeted = bills.filter(b => b.type === 'shared').reduce((acc, b) => acc + Number(b.budgetedValue), 0);
    const totalParkingBudgeted = bills.filter(b => b.type === 'parking').reduce((acc, b) => acc + Number(b.budgetedValue), 0);
    const totalHouseSuppliesBudgeted = bills.filter(b => b.type === 'house_supplies').reduce((acc, b) => acc + Number(b.budgetedValue), 0);

    const rentPerWeight = totalWeight > 0 ? totalRentBudgeted / totalWeight : 0;
    const sharedPerPerson = residents.length > 0 ? (totalSharedBudgeted + totalHouseSuppliesBudgeted) / residents.length : 0;

    const breakdown = residents.map(res => {
      let totalToPay = 0;
      totalToPay += (Number(res.rentWeight) || 0) * rentPerWeight;
      totalToPay += sharedPerPerson;
      if (res.name === 'Eduardo') totalToPay += totalParkingBudgeted;
      
      const individualCharges = bills
        .filter(b => b.type === 'individual' && b.targetResidentId === res.id)
        .reduce((acc, b) => acc + Number(b.budgetedValue), 0);
      totalToPay += individualCharges;

      if (res.name === 'Menon') {
        // Se o Menon pagou a compra, ele recebe o crédito do valor REAL que ele gastou (actualValue)
        const credit = bills.filter(b => b.type === 'house_supplies').reduce((acc, b) => acc + Number(b.actualValue), 0);
        totalToPay -= credit;
      }

      const receipt = receipts.find(rec => rec.residentId === res.id && rec.monthId === currentMonthId);

      return {
        ...res,
        total: totalToPay,
        isReceived: receipt?.received || false,
        receivedAt: receipt?.receivedAt
      };
    });

    return {
      breakdown,
      totalChargedThisMonth: totalRentBudgeted + totalSharedBudgeted + totalParkingBudgeted + totalHouseSuppliesBudgeted + bills.filter(b => b.type === 'individual').reduce((acc, b) => acc + Number(b.budgetedValue), 0)
    };
  }, [residents, bills, receipts, currentMonthId]);

  // --- Handlers ---
  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBill.description || !newBill.budgetedValue) return;
    
    const billData: any = {
      description: newBill.description,
      budgetedValue: parseFloat(newBill.budgetedValue),
      actualValue: parseFloat(newBill.actualValue || newBill.budgetedValue), // Se não informar o real, assume o cobrado
      type: newBill.type,
      monthId: currentMonthId,
      isPaid: false,
      createdAt: Date.now()
    };
    
    if (newBill.type === 'individual' && newBill.targetId !== 'all') {
      billData.targetResidentId = newBill.targetId;
    }
    
    await addDoc(collection(db, 'artifacts', APTO_ID, 'public', 'data', 'bills'), billData);
    setNewBill({ description: '', budgetedValue: '', actualValue: '', type: 'shared', targetId: 'all' });
  };

  const toggleBillPaid = async (bill: Bill) => {
    const billRef = doc(db, 'artifacts', APTO_ID, 'public', 'data', 'bills', bill.id);
    await updateDoc(billRef, { isPaid: !bill.isPaid, paidAt: !bill.isPaid ? Date.now() : null });
  };

  const toggleReceiptStatus = async (res: any) => {
    const receiptId = `${res.id}_${currentMonthId}`;
    await setDoc(doc(db, 'artifacts', APTO_ID, 'public', 'data', 'receipts', receiptId), {
      residentId: res.id, monthId: currentMonthId, received: !res.isReceived, receivedAt: !res.isReceived ? Date.now() : null
    }, { merge: true });
  };

  const copySummary = () => {
    let text = `📊 *RESUMO APTO - ${selectedDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}*\n\n`;
    text += `📝 *CONTAS DO MÊS:*\n`;
    bills.forEach(b => {
      text += `- ${b.description}: R$ ${b.budgetedValue.toFixed(2)}\n`;
    });
    text += `\n👥 *VALORES POR MORADOR:*\n`;
    totals.breakdown.forEach(r => {
      text += `*${r.name.toUpperCase()}*: R$ ${r.total.toFixed(2)} ${r.isReceived ? '✅' : '⏳'}\n`;
    });
    text += `\n💰 *TOTAL COBRADO:* R$ ${totals.totalChargedThisMonth.toFixed(2)}\n`;
    text += `🐷 *SALDO CAIXINHA:* R$ ${caixinhaBalance.toFixed(2)}`;
    
    const textArea = document.createElement("textarea");
    textArea.value = text; document.body.appendChild(textArea); textArea.select();
    document.execCommand('copy'); document.body.removeChild(textArea);
    alert("Resumo copiado!");
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-800 font-sans antialiased">
      <div className="max-w-7xl mx-auto">
        
        {/* Header com Navegação */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 bg-white p-2 rounded-3xl shadow-sm border border-slate-100">
            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))} className="p-3 hover:bg-slate-50 rounded-2xl"><ChevronLeft /></button>
            <div className="flex flex-col items-center px-8">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Gestão Mensal</span>
              <span className="text-xl font-black text-slate-900 capitalize">{selectedDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</span>
            </div>
            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))} className="p-3 hover:bg-slate-50 rounded-2xl"><ChevronRight /></button>
          </div>
          <button onClick={copySummary} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-slate-800 flex items-center gap-2 shadow-xl shadow-slate-200"><Download size={20} /> Copiar para WhatsApp</button>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard title="Cobrado no Mês" value={totals.totalChargedThisMonth} icon={<Receipt />} theme="dark" />
          <StatCard title="Pendente Receber" value={totals.breakdown.reduce((acc, r) => acc + (!r.isReceived ? r.total : 0), 0)} icon={<Clock />} theme="emerald" />
          <StatCard title="Saldo Excedente (Caixinha)" value={caixinhaBalance} icon={<PiggyBank />} theme={caixinhaBalance < 0 ? "red" : "amber"} subtitle="Acumulado histórico de sobras" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            
            {/* Novo Formulário com Valor Cobrado vs Real */}
            <section className="bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100">
              <h2 className="text-2xl font-black mb-8 flex items-center gap-3 text-slate-800">
                <PlusCircle className="text-blue-600" size={28} /> Lançar Conta
              </h2>
              <form onSubmit={handleAddBill} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Descrição</label>
                    <input className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 font-bold" placeholder="Ex: Romilda" value={newBill.description} onChange={e => setNewBill({...newBill, description: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Categoria</label>
                    <select className="w-full p-4 bg-slate-100 border-none rounded-2xl font-bold text-xs" value={newBill.type} onChange={e => setNewBill({...newBill, type: e.target.value as BillType})}>
                      <option value="shared">Dividido por 6</option>
                      <option value="house_supplies">Compras Casa (Menon 🛒)</option>
                      <option value="rent">Aluguel (Proporcional)</option>
                      <option value="parking">Garagem (Só Eduardo)</option>
                      <option value="individual">Extra Individual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Valor a COBRAR (Rateio)</label>
                    <input type="number" step="0.01" className="w-full p-4 bg-blue-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 font-black text-blue-700" placeholder="R$ 875,00" value={newBill.budgetedValue} onChange={e => setNewBill({...newBill, budgetedValue: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Valor REAL Pago (Fatura)</label>
                    <input type="number" step="0.01" className="w-full p-4 bg-emerald-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 font-black text-emerald-700" placeholder="R$ 395,00" value={newBill.actualValue} onChange={e => setNewBill({...newBill, actualValue: e.target.value})} />
                  </div>
                </div>

                <div className="flex justify-between items-center gap-4">
                  {newBill.type === 'individual' && (
                    <select className="p-4 bg-blue-50 text-blue-700 rounded-2xl font-bold text-xs flex-1" value={newBill.targetId} onChange={e => setNewBill({...newBill, targetId: e.target.value})}>
                      <option value="all">Escolha o morador...</option>
                      {residents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  <button type="submit" className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black hover:bg-blue-700 ml-auto shadow-xl shadow-blue-100 transition-all">LANÇAR CONTA</button>
                </div>
              </form>
            </section>

            {/* Recebimentos */}
            <section className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800">Status dos Recebimentos</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr><th className="px-10 py-6">Morador</th><th className="px-10 py-6">Devido</th><th className="px-10 py-6">Confirmar</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {totals.breakdown.map(res => (
                      <tr key={res.id} className={res.isReceived ? 'bg-emerald-50/20' : ''}>
                        <td className="px-10 py-6">
                          <span className="font-black text-slate-700 text-lg">{res.name}</span>
                          {res.isReceived && <p className="text-[9px] text-emerald-600 font-bold uppercase">Recebido em {new Date(res.receivedAt!).toLocaleDateString()}</p>}
                        </td>
                        <td className="px-10 py-6 font-mono font-black">R$ {res.total.toFixed(2)}</td>
                        <td className="px-10 py-6">
                          <button onClick={() => toggleReceiptStatus(res)} className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase transition-all ${res.isReceived ? 'bg-red-50 text-red-500' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-100'}`}>
                            {res.isReceived ? 'Desfazer' : 'Confirmar Pix'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Sidebar com Excedentes Individuais */}
          <div className="space-y-10">
            <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-2 text-blue-600"><Receipt size={22} /> Contas e Excedentes</h2>
              <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
                {bills.map(bill => {
                  const surplus = bill.budgetedValue - bill.actualValue;
                  return (
                    <div key={bill.id} className="p-5 rounded-3xl border border-slate-100 group relative bg-white hover:border-blue-200 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-sm font-black text-slate-800">{bill.description}</p>
                          <span className="text-[9px] font-bold text-slate-400">Cobrado: R$ {bill.budgetedValue.toFixed(2)}</span>
                        </div>
                        <button onClick={() => deleteDoc(doc(db, 'artifacts', APTO_ID, 'public', 'data', 'bills', bill.id))} className="text-red-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                      </div>
                      
                      <div className={`flex items-center gap-1.5 p-2 rounded-xl text-[10px] font-black uppercase ${surplus >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {surplus >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {surplus >= 0 ? `Sobrou R$ ${surplus.toFixed(2)} p/ Caixinha` : `Faltou R$ ${Math.abs(surplus).toFixed(2)}`}
                      </div>

                      <button onClick={() => toggleBillPaid(bill)} className={`mt-3 w-full py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${bill.isPaid ? 'bg-emerald-500 text-white border-transparent' : 'bg-white text-slate-400 border-slate-100'}`}>
                        {bill.isPaid ? 'PAGO AO FORNECEDOR ✅' : 'PENDENTE PAGAR'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, theme, subtitle }: { title: string, value: number, icon: React.ReactNode, theme: string, subtitle?: string }) {
  const themes: Record<string, string> = {
    dark: "bg-slate-900 text-white",
    emerald: "bg-white text-slate-900 border-slate-100",
    amber: "bg-amber-500 text-white shadow-amber-200",
    red: "bg-red-500 text-white",
  };
  const isLight = theme === 'emerald';
  return (
    <div className={`p-8 rounded-[2.5rem] shadow-xl border flex items-center gap-6 transition-all hover:scale-105 ${themes[theme]}`}>
      <div className={`p-4 rounded-2xl ${isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-white/10 text-white'}`}>{React.cloneElement(icon as React.ReactElement<any>, { size: 28 })}</div>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-slate-400' : 'text-white/60'}`}>{title}</p>
        <h3 className="text-3xl font-black font-mono">R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
        {subtitle && <p className="text-[9px] mt-1 font-bold opacity-60">{subtitle}</p>}
      </div>
    </div>
  );
}