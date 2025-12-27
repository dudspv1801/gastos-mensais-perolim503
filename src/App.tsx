import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, 
  Trash2, 
  Users, 
  Receipt, 
  PiggyBank, 
  Download, 
  DollarSign,
  LogIn,
  LogOut,
  ShieldCheck,
  Eye,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Car,
  Clock,
  CheckCircle2
} from 'lucide-react';

// Firebase Imports
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';

// --- Interfaces ---
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
  budgetedValue: number;
  actualValue: number;
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

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactElement;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'indigo';
  subtitle?: string;
}

// --- Firebase Config & Init ---
const firebaseConfig = {
  apiKey: "AIzaSyBJDYaUNTJjkW46FV0kBaameQyJ1JHr6u8",
  authDomain: "gestor-de-contas-b546e.firebaseapp.com",
  projectId: "gestor-de-contas-b546e",
  storageBucket: "gestor-de-contas-b546e.firebasestorage.app",
  messagingSenderId: "980131809506",
  appId: "1:980131809506:web:7ef3e90c1853bdf12d36bb"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ATENÇÃO: Este ID deve ser o mesmo das regras do Firebase (Rules)
const APTO_ID = 'apartamento-producao-v1';
const ADMIN_EMAIL = "edduducamargos@gmail.com";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'public' | 'admin'>('public');
  const [statusMsg, setStatusMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
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

  const [newCaixinha, setNewCaixinha] = useState({ description: '', value: '', type: 'credit' as 'credit' | 'debit' });

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user]);

  // Limpar mensagem de status após 3 segundos
  useEffect(() => {
    if (statusMsg) {
      const timer = setTimeout(() => setStatusMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  // 1. Lógica de Autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u?.email === ADMIN_EMAIL) setViewMode('admin');
      else setViewMode('public');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Sincronização de Dados
  useEffect(() => {
    if (!user) return;
    const billsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'bills');
    const residentsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'residents');
    const receiptsRef = collection(db, 'artifacts', APTO_ID, 'public', 'data', 'receipts');

    const unsubBills = onSnapshot(billsRef, (s) => {
      const data = s.docs.map(d => ({ ...d.data(), id: d.id } as Bill));
      setAllBills(data.sort((a, b) => b.createdAt - a.createdAt));
    }, (error) => console.error("Erro Firestore Bills:", error));

    const unsubResidents = onSnapshot(residentsRef, (s) => {
      const data = s.docs.map(d => ({ ...d.data(), id: d.id } as Resident));
      if (data.length === 0 && isAdmin) setupDefaultResidents();
      else setResidents(data.sort((a, b) => a.index - b.index));
    }, (error) => console.error("Erro Firestore Residents:", error));

    const unsubReceipts = onSnapshot(receiptsRef, (s) => 
      setReceipts(s.docs.map(d => ({ ...d.data(), id: d.id } as ReceiptStatus)))
    , (error) => console.error("Erro Firestore Receipts:", error));

    return () => { unsubBills(); unsubResidents(); unsubReceipts(); };
  }, [user, isAdmin]);

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

  // Filtragem e Cálculos
  const bills = useMemo(() => allBills.filter(b => b.monthId === currentMonthId), [allBills, currentMonthId]);

  const caixinhaBalance = useMemo(() => {
    return allBills.reduce((acc, b) => acc + (Number(b.budgetedValue) - Number(b.actualValue)), 0);
  }, [allBills]);

  const totals = useMemo(() => {
    const totalWeight = residents.reduce((acc, r) => acc + (Number(r.rentWeight) || 0), 0);
    
    const getSum = (type: BillType) => bills.filter(b => b.type === type).reduce((acc, b) => acc + Number(b.budgetedValue), 0);
    const getActualSum = (type: BillType) => bills.filter(b => b.type === type).reduce((acc, b) => acc + Number(b.actualValue), 0);

    const totalRent = getSum('rent');
    const totalShared = getSum('shared');
    const totalParking = getSum('parking');
    const totalHouseSupplies = getSum('house_supplies'); 
    const realHouseSupplies = getActualSum('house_supplies'); 

    const rentPerWeight = totalWeight > 0 ? totalRent / totalWeight : 0;
    const sharedPerPerson = residents.length > 0 ? (totalShared + totalHouseSupplies) / residents.length : 0;

    const breakdown = residents.map(res => {
      let totalToPay = 0;
      const rShare = (Number(res.rentWeight) || 0) * rentPerWeight;
      totalToPay += rShare + sharedPerPerson;
      if (res.name === 'Eduardo') totalToPay += totalParking;
      
      const extras = bills.filter(b => b.type === 'individual' && b.targetResidentId === res.id).reduce((acc, b) => acc + Number(b.budgetedValue), 0);
      totalToPay += extras;

      let credit = 0;
      if (res.name === 'Menon') {
        credit = realHouseSupplies;
        totalToPay -= credit;
      }

      const receipt = receipts.find(rec => rec.residentId === res.id && rec.monthId === currentMonthId);

      return {
        ...res,
        rentShare: rShare,
        sharedShare: sharedPerPerson,
        credit,
        total: totalToPay,
        isReceived: receipt?.received || false,
        receivedAt: receipt?.receivedAt
      };
    });

    return {
      breakdown,
      totalCharged: totalRent + totalShared + totalParking + totalHouseSupplies + bills.filter(b => b.type === 'individual').reduce((acc, b) => acc + Number(b.budgetedValue), 0)
    };
  }, [residents, bills, receipts, currentMonthId]);

  // Handlers
  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setStatusMsg({ type: 'error', text: 'Apenas Eduardo pode lançar contas.' });
      return;
    }
    if (!newBill.description || !newBill.budgetedValue) return;

    try {
      await addDoc(collection(db, 'artifacts', APTO_ID, 'public', 'data', 'bills'), {
        description: newBill.description,
        budgetedValue: parseFloat(newBill.budgetedValue),
        actualValue: parseFloat(newBill.actualValue || newBill.budgetedValue),
        type: newBill.type,
        monthId: currentMonthId,
        isPaid: false,
        createdAt: Date.now(),
        targetResidentId: newBill.type === 'individual' ? newBill.targetId : null
      });
      setNewBill({ description: '', budgetedValue: '', actualValue: '', type: 'shared', targetId: 'all' });
      setStatusMsg({ type: 'success', text: 'Gasto lançado com sucesso!' });
    } catch (err) {
      console.error("Erro ao salvar:", err);
      setStatusMsg({ type: 'error', text: 'Erro ao salvar no banco. Verifique as regras do Firebase.' });
    }
  };

  const handleAddCaixinha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newCaixinha.description || !newCaixinha.value) return;
    try {
      await addDoc(collection(db, 'artifacts', APTO_ID, 'public', 'data', 'bills'), {
        description: newCaixinha.description,
        budgetedValue: newCaixinha.type === 'credit' ? parseFloat(newCaixinha.value) : 0,
        actualValue: newCaixinha.type === 'debit' ? parseFloat(newCaixinha.value) : 0,
        type: 'individual', // Usamos um tipo neutro para lançamentos manuais
        monthId: currentMonthId,
        createdAt: Date.now()
      });
      setNewCaixinha({ description: '', value: '', type: 'credit' });
      setStatusMsg({ type: 'success', text: 'Movimentação registada!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Erro ao registar na caixinha.' });
    }
  };

  const toggleReceiptStatus = async (res: any) => {
    if (!isAdmin) return;
    const receiptId = `${res.id}_${currentMonthId}`;
    await setDoc(doc(db, 'artifacts', APTO_ID, 'public', 'data', 'receipts', receiptId), {
      residentId: res.id, monthId: currentMonthId, received: !res.isReceived, receivedAt: !res.isReceived ? Date.now() : null
    }, { merge: true });
  };

  const copySummary = () => {
    let text = `📊 *RESUMO APTO - ${selectedDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}*\n\n`;
    text += `📝 *CONTAS DO MÊS:*\n`;
    bills.forEach(b => text += `- ${b.description}: R$ ${b.budgetedValue.toFixed(2)}\n`);
    text += `\n👥 *TOTAL POR MORADOR:*\n`;
    totals.breakdown.forEach(r => text += `*${r.name.toUpperCase()}*: R$ ${r.total.toFixed(2)} ${r.isReceived ? '✅' : '⏳'}\n`);
    text += `\n💰 *TOTAL:* R$ ${totals.totalCharged.toFixed(2)}\n🐷 *CAIXINHA:* R$ ${caixinhaBalance.toFixed(2)}`;
    
    const textArea = document.createElement("textarea");
    textArea.value = text; document.body.appendChild(textArea); textArea.select();
    document.execCommand('copy'); document.body.removeChild(textArea);
    alert("Resumo copiado!");
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-10">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* Status Toast */}
        {statusMsg && (
          <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 ${statusMsg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {statusMsg.type === 'success' ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}
            <span className="font-bold text-sm">{statusMsg.text}</span>
          </div>
        )}

        {/* Header & Nav */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-slate-900 text-white rounded-3xl"><Users size={32} /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gestão Perolim 503</h1>
              <div className="flex items-center gap-4 bg-slate-50 p-1.5 rounded-xl mt-2 border border-slate-100">
                <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))} className="p-1 hover:bg-white rounded-md transition-colors"><ChevronLeft size={16}/></button>
                <span className="text-[10px] font-black uppercase text-slate-500 w-24 text-center">{selectedDate.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))} className="p-1 hover:bg-white rounded-md transition-colors"><ChevronRight size={16}/></button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!user ? (
              <button onClick={() => signInWithPopup(auth, provider)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95 transition-all"><LogIn size={20} /> Login Admin</button>
            ) : (
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <nav className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setViewMode('public')} className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'public' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Ver</button>
                    <button onClick={() => setViewMode('admin')} className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${viewMode === 'admin' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Gestão</button>
                  </nav>
                )}
                <button onClick={() => signOut(auth)} className="text-[10px] font-black text-red-500 uppercase">Sair</button>
                {user.photoURL && <img src={user.photoURL} className="w-10 h-10 rounded-2xl border-2 border-white shadow-sm" />}
              </div>
            )}
            <button onClick={copySummary} className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl active:scale-95 transition-all"><Download size={20} /></button>
          </div>
        </header>

        {/* Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <StatCard title="Cobrado no Mês" value={totals.totalCharged} icon={<Receipt />} color="indigo" />
          <StatCard title="Pendente Receber" value={totals.breakdown.reduce((acc, r) => acc + (!r.isReceived ? r.total : 0), 0)} icon={<Clock />} color="blue" />
          <StatCard title="Saldo Excedente" value={caixinhaBalance} icon={<PiggyBank />} color={caixinhaBalance < 0 ? "red" : "amber"} subtitle="Acumulado Caixinha" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            
            {/* Lançamento Form (Só Admin) */}
            {isAdmin && viewMode === 'admin' && (
              <section className="bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100">
                <h2 className="text-xl font-black mb-8 flex items-center gap-3 text-slate-800"><PlusCircle className="text-blue-600" /> Novo Gasto</h2>
                <form onSubmit={handleAddBill} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input className="p-4 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100" placeholder="Descrição (Ex: Romilda)" value={newBill.description} onChange={e => setNewBill({...newBill, description: e.target.value})} />
                    <select className="p-4 bg-slate-100 border-none rounded-2xl font-black text-xs outline-none" value={newBill.type} onChange={e => setNewBill({...newBill, type: e.target.value as BillType})}>
                      <option value="shared">Dividido por 6</option>
                      <option value="rent">Aluguel (Proporcional)</option>
                      <option value="house_supplies">Compras Casa (Reembolso Menon)</option>
                      <option value="parking">Só Eduardo (Garagem)</option>
                      <option value="individual">Extra Individual</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 ml-4 uppercase">Valor Cobrado (Rateio)</label>
                       <input type="number" step="0.01" className="w-full p-4 bg-blue-50 text-blue-700 border-none rounded-2xl font-black outline-none focus:ring-2 focus:ring-blue-200" placeholder="R$ 0,00" value={newBill.budgetedValue} onChange={e => setNewBill({...newBill, budgetedValue: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 ml-4 uppercase">Valor Pago (Real)</label>
                       <input type="number" step="0.01" className="w-full p-4 bg-emerald-50 text-emerald-700 border-none rounded-2xl font-black outline-none focus:ring-2 focus:ring-emerald-200" placeholder="R$ 0,00" value={newBill.actualValue} onChange={e => setNewBill({...newBill, actualValue: e.target.value})} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    {newBill.type === 'individual' && (
                      <select className="p-4 bg-blue-50 text-blue-700 rounded-2xl font-bold text-xs" value={newBill.targetId} onChange={e => setNewBill({...newBill, targetId: e.target.value})}>
                        <option value="all">Escolha o morador...</option>
                        {residents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                    <button type="submit" className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl ml-auto hover:bg-blue-700 active:scale-95 transition-all">LANÇAR CONTA</button>
                  </div>
                </form>
              </section>
            )}

            {/* Tabela de Recebimento */}
            <section className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/20 text-slate-800 font-black uppercase text-xs tracking-widest">Controle de Pagamentos</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black">
                    <tr><th className="px-8 py-5">Morador</th><th className="px-8 py-5">Aluguel</th><th className="px-8 py-5">Devido</th><th className="px-8 py-5 text-right">Pix</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {totals.breakdown.map(res => (
                      <tr key={res.id} className={`${res.isReceived ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'}`}>
                        <td className="px-8 py-6 font-black text-slate-700">{res.name}</td>
                        <td className="px-8 py-6 font-mono text-xs font-bold text-slate-400">R$ {res.rentShare.toFixed(2)}</td>
                        <td className="px-8 py-6 font-mono font-black text-lg">R$ {res.total.toFixed(2)}</td>
                        <td className="px-8 py-6 text-right">
                          <button onClick={() => toggleReceiptStatus(res)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${res.isReceived ? 'bg-red-50 text-red-500' : 'bg-emerald-500 text-white'}`}>
                            {res.isReceived ? 'Desfazer' : 'Recebi'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-10">
            {/* Histórico e Excedentes */}
            <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <h2 className="text-lg font-black mb-8 flex items-center gap-2 text-slate-800 uppercase tracking-tight"><Receipt size={20} className="text-blue-600" /> Contas & Sobras</h2>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {bills.map(bill => {
                  const surplus = bill.budgetedValue - bill.actualValue;
                  return (
                    <div key={bill.id} className="p-5 rounded-3xl border border-slate-100 group relative hover:border-blue-200 transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <p className="text-sm font-black text-slate-800">{bill.description}</p>
                        {isAdmin && <button onClick={() => deleteDoc(doc(db, 'artifacts', APTO_ID, 'public', 'data', 'bills', bill.id))} className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>}
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded-xl text-[10px] font-black uppercase ${surplus >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {surplus >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {surplus >= 0 ? `Sobrou R$ ${surplus.toFixed(2)}` : `Faltou R$ ${Math.abs(surplus).toFixed(2)}`}
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 mt-2 text-right">Cobrado: R$ {bill.budgetedValue.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Caixinha Form (Apenas Admin) */}
            {isAdmin && viewMode === 'admin' && (
              <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 animate-in">
                <h2 className="text-lg font-black mb-8 text-amber-500 uppercase tracking-tight flex items-center gap-3"><PiggyBank size={24} /> Caixinha</h2>
                <form onSubmit={handleAddCaixinha} className="space-y-5">
                  <input type="text" placeholder="Motivo..." className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none" value={newCaixinha.description} onChange={e => setNewCaixinha({...newCaixinha, description: e.target.value})} />
                  <div className="flex gap-3">
                    <input type="number" placeholder="R$" className="w-2/3 p-4 bg-slate-50 rounded-2xl font-black outline-none" value={newCaixinha.value} onChange={e => setNewCaixinha({...newCaixinha, value: e.target.value})} />
                    <select className="w-1/3 p-4 bg-slate-100 rounded-2xl font-black text-[10px] outline-none" value={newCaixinha.type} onChange={e => setNewCaixinha({...newCaixinha, type: e.target.value as any})}>
                      <option value="credit">ENTRADA</option><option value="debit">SAÍDA</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-amber-500 text-white p-4 rounded-2xl font-black shadow-xl hover:bg-amber-600 transition-all">REGISTRAR</button>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-50 text-indigo-600"
  };
  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:scale-[1.02] transition-all group">
      <div className="flex items-center gap-5">
        <div className={`p-4 rounded-2xl transition-transform group-hover:rotate-6 ${colors[color]}`}>{React.cloneElement(icon as React.ReactElement<any>, { size: 28 })}</div>
        <div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-2">{title}</p>
          <h3 className="text-2xl font-black text-slate-900 font-mono">R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
          {subtitle && <p className="text-[9px] font-bold text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}