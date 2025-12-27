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
  Eye
} from 'lucide-react';

// Importações do Firebase
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  query
} from 'firebase/firestore';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';

// --- Interfaces de Tipagem ---
interface Resident {
  id: string;
  name: string;
  index: number;
}

interface Bill {
  id: string;
  description: string;
  value: number;
  createdAt: number;
}

interface CaixinhaTransaction {
  id: string;
  description: string;
  value: number;
  type: 'credit' | 'debit';
  createdAt: number;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactElement;
  color: string;
  subtitle?: string;
}

// --- Inicialização do Firebase ---
// Definindo variáveis globais do ambiente para evitar erros de compilação
declare global {
  const __firebase_config: string | undefined;
  const __app_id: string | undefined;
}

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "seu-projeto.firebaseapp.com",
      projectId: "seu-projeto",
      storageBucket: "seu-projeto.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:000000000000"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'apartamento-compartilhado';

// --- COLOQUE SEU E-MAIL AQUI ---
const ADMIN_EMAIL = "seu-email@gmail.com"; 

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'public' | 'admin'>('public');
  const [residents, setResidents] = useState<Resident[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [caixinhaTransactions, setCaixinhaTransactions] = useState<CaixinhaTransaction[]>([]);
  
  const [newBill, setNewBill] = useState({ description: '', value: '' });
  const [newCaixinha, setNewCaixinha] = useState({ description: '', value: '', type: 'credit' as 'credit' | 'debit' });

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user]);

  // 1. Efeito de Autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Se não for admin, força o modo público
      if (u?.email !== ADMIN_EMAIL) setViewMode('public');
    });
    return () => unsubscribe();
  }, []);

  // 2. Efeito de Busca de Dados
  useEffect(() => {
    const billsCol = collection(db, 'artifacts', appId, 'public', 'data', 'bills');
    const residentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'residents');
    const caixinhaCol = collection(db, 'artifacts', appId, 'public', 'data', 'caixinha');

    const unsubBills = onSnapshot(billsCol, (snapshot) => {
      setBills(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill)));
    });

    const unsubResidents = onSnapshot(residentsCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Resident));
      if (data.length === 0 && isAdmin) {
        initializeResidents();
      } else {
        setResidents(data.sort((a, b) => a.index - b.index));
      }
    });

    const unsubCaixinha = onSnapshot(caixinhaCol, (snapshot) => {
      setCaixinhaTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CaixinhaTransaction)));
    });

    return () => {
      unsubBills();
      unsubResidents();
      unsubCaixinha();
    };
  }, [user, isAdmin]);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth);

  const initializeResidents = async () => {
    const residentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'residents');
    for (let i = 1; i <= 6; i++) {
      await addDoc(residentsCol, { name: `Morador ${i}`, index: i });
    }
  };

  // --- Cálculos ---
  const totalBills = useMemo(() => bills.reduce((acc, b) => acc + Number(b.value), 0), [bills]);
  const perPerson = useMemo(() => residents.length > 0 ? totalBills / residents.length : 0, [totalBills, residents]);
  const caixinhaBalance = useMemo(() => {
    return caixinhaTransactions.reduce((acc, t) => t.type === 'credit' ? acc + Number(t.value) : acc - Number(t.value), 0);
  }, [caixinhaTransactions]);

  // --- Acções Protegidas ---
  const addBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newBill.description || !newBill.value) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bills'), {
      description: newBill.description,
      value: Number(newBill.value),
      createdAt: Date.now()
    });
    setNewBill({ description: '', value: '' });
  };

  const removeBill = async (id: string) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bills', id));
  };

  const updateResidentName = async (id: string, newName: string) => {
    if (!isAdmin) return;
    const residentRef = doc(db, 'artifacts', appId, 'public', 'data', 'residents', id);
    await updateDoc(residentRef, { name: newName });
  };

  const copyToClipboard = () => {
    const text = `📊 RESUMO - APARTAMENTO\nTotal: R$ ${totalBills.toFixed(2)}\nPor Pessoa: R$ ${perPerson.toFixed(2)}\nCaixinha: R$ ${caixinhaBalance.toFixed(2)}`;
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Header Profissional */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-2xl">
              <Users size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Gestão do Apê</h1>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                {isAdmin ? <ShieldCheck size={12} className="text-emerald-500" /> : <Eye size={12} />}
                {isAdmin ? "Modo Administrador" : "Modo Visualização"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!user ? (
              <button onClick={login} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-100">
                <LogIn size={18} /> Entrar com Google
              </button>
            ) : (
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <nav className="flex bg-slate-100 p-1 rounded-xl mr-2">
                    <button onClick={() => setViewMode('public')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'public' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Público</button>
                    <button onClick={() => setViewMode('admin')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'admin' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Editar</button>
                  </nav>
                )}
                <button onClick={logout} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                  <LogOut size={20} />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Dashboard de Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <StatCard title="Total em Contas" value={totalBills} icon={<Receipt />} color="blue" />
          <StatCard title="Rateio p/ Pessoa" value={perPerson} icon={<DollarSign />} color="emerald" subtitle={`(${residents.length} moradores)`} />
          <StatCard title="Saldo Caixinha" value={caixinhaBalance} icon={<PiggyBank />} color={caixinhaBalance < 0 ? "red" : "amber"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            
            {/* Secção de Lançamento (Só Admin) */}
            {isAdmin && viewMode === 'admin' && (
              <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
                <h2 className="text-lg font-black mb-6 flex items-center gap-2 text-blue-600 uppercase tracking-tight">
                  <PlusCircle size={20} /> Lançar Despesa
                </h2>
                <form onSubmit={addBill} className="flex flex-col md:flex-row gap-4">
                  <input type="text" placeholder="Descrição da conta..." className="flex-1 p-4 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all" value={newBill.description} onChange={e => setNewBill({...newBill, description: e.target.value})} />
                  <input type="number" placeholder="Valor R$" className="w-full md:w-40 p-4 bg-slate-50 border-none rounded-2xl font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all" value={newBill.value} onChange={e => setNewBill({...newBill, value: e.target.value})} />
                  <button type="submit" className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">ADICIONAR</button>
                </form>
              </section>
            )}

            {/* Listagem de Contas */}
            <section className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Detalhamento do Mês</h2>
                <button onClick={copyToClipboard} className="text-slate-400 hover:text-blue-600 p-2 rounded-xl transition-all">
                  <Download size={20} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-8 py-5">Descrição</th>
                      <th className="px-8 py-5">Valor</th>
                      {isAdmin && viewMode === 'admin' && <th className="px-8 py-5 text-right">Acção</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {bills.length === 0 ? (
                      <tr><td colSpan={3} className="px-8 py-12 text-center text-slate-300 italic">Nenhum gasto registrado neste período.</td></tr>
                    ) : (
                      bills.map(bill => (
                        <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-8 py-5 font-bold text-slate-700">{bill.description}</td>
                          <td className="px-8 py-5 font-mono font-bold text-slate-900">R$ {Number(bill.value).toFixed(2)}</td>
                          {isAdmin && viewMode === 'admin' && (
                            <td className="px-8 py-5 text-right">
                              <button onClick={() => removeBill(bill.id)} className="text-slate-200 hover:text-red-500 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                <Trash2 size={18} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="space-y-8">
            {/* Card de Moradores */}
            <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h2 className="text-lg font-black mb-6 flex items-center gap-2 text-slate-800 uppercase tracking-tight">Moradores</h2>
              <div className="space-y-4">
                {residents.map(res => (
                  <div key={res.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-100 transition-all">
                    <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-xs font-black text-blue-600 shadow-sm border border-slate-100">
                      {res.index}
                    </div>
                    {isAdmin && viewMode === 'admin' ? (
                      <input 
                        type="text" 
                        value={res.name} 
                        onChange={(e) => updateResidentName(res.id, e.target.value)} 
                        className="flex-1 bg-transparent font-bold text-slate-700 outline-none focus:text-blue-600"
                      />
                    ) : (
                      <span className="font-bold text-slate-700">{res.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Crédito/Débito Caixinha */}
            {isAdmin && viewMode === 'admin' && (
              <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-lg font-black mb-6 flex items-center gap-2 text-amber-500 uppercase tracking-tight">Caixinha</h2>
                <div className="space-y-4">
                  <input type="text" placeholder="Motivo..." className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none text-sm" value={newCaixinha.description} onChange={e => setNewCaixinha({...newCaixinha, description: e.target.value})} />
                  <div className="flex gap-2">
                    <input type="number" placeholder="R$" className="w-2/3 p-4 bg-slate-50 rounded-2xl font-black outline-none text-sm" value={newCaixinha.value} onChange={e => setNewCaixinha({...newCaixinha, value: e.target.value})} />
                    <select className="w-1/3 p-4 bg-slate-100 rounded-2xl font-bold text-xs outline-none" value={newCaixinha.type} onChange={e => setNewCaixinha({...newCaixinha, type: e.target.value as 'credit' | 'debit'})}>
                      <option value="credit">Entrada</option>
                      <option value="debit">Saída</option>
                    </select>
                  </div>
                  <button onClick={() => {}} className="w-full bg-amber-500 text-white p-4 rounded-2xl font-black hover:bg-amber-600 transition-all shadow-lg shadow-amber-100">REGISTRAR</button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, subtitle }) => (
  <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:scale-[1.02] transition-all">
    <div className="flex items-center gap-5">
      <div className={`p-4 bg-${color}-50 text-${color}-600 rounded-2xl`}>
        {/* Usamos cast para any para permitir a injeção da prop size em tempo de execução */}
        {React.cloneElement(icon as React.ReactElement<any>, { size: 28 })}
      </div>
      <div>
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-2">{title} {subtitle && <span className="lowercase font-bold"> {subtitle}</span>}</p>
        <h3 className="text-2xl font-black text-slate-900 font-mono tracking-tighter">R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
      </div>
    </div>
  </div>
);

export default App;