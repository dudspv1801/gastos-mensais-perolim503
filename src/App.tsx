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
  AlertTriangle
} from 'lucide-react';

// Importações do Firebase
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc
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
  color: 'blue' | 'emerald' | 'amber' | 'red';
  subtitle?: string;
}

// --- Inicialização do Firebase Segura ---
declare global {
  interface Window {
    __firebase_config?: string;
    __app_id?: string;
  }
}

const getFirebaseConfig = () => {
  // 1. Tenta pegar a configuração injetada pelo ambiente (se houver)
  if (typeof window !== 'undefined' && window.__firebase_config) {
    try {
      return JSON.parse(window.__firebase_config);
    } catch (e) {
      console.error("Erro ao processar __firebase_config");
    }
  }
  
  // 2. Eduardo, se o build estiver falhando por causa de variáveis de ambiente,
  // você pode preencher os valores do seu projeto diretamente neste objeto abaixo.
  return {
    apiKey: "", // Cole sua API Key aqui
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };
};

const config = getFirebaseConfig();

// Previne o crash se a configuração estiver vazia (Tela Branca)
const isFirebaseConfigValid = config && config.apiKey && config.projectId;

let app: any, auth: any, db: any;
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

if (isFirebaseConfigValid) {
  app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
}

const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'apartamento-producao-v1';

// --- CONFIGURAÇÃO DE ACESSO ---
// Eduardo, coloque o seu e-mail do Google aqui para ter acesso administrativo total
const ADMIN_EMAIL = "seu-email@gmail.com"; 

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'public' | 'admin'>('public');
  const [residents, setResidents] = useState<Resident[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [caixinhaTransactions, setCaixinhaTransactions] = useState<CaixinhaTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newBill, setNewBill] = useState({ description: '', value: '' });
  const [newCaixinha, setNewCaixinha] = useState({ description: '', value: '', type: 'credit' as 'credit' | 'debit' });

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user]);

  // Se o Firebase não estiver configurado corretamente, exibe um aviso claro
  if (!isFirebaseConfigValid) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-xl text-center border border-red-100">
          <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="text-red-500" size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3">Configuração Necessária</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            As credenciais do Firebase não foram encontradas. Para o site funcionar em produção, você deve preencher as chaves no código ou nas variáveis de ambiente.
          </p>
          <div className="bg-slate-900 p-6 rounded-2xl text-left font-mono text-xs text-blue-300 overflow-auto border border-slate-800">
            // Edite o arquivo gestor-apartamento.jsx <br/>
            // Procure pela função getFirebaseConfig() <br/>
            apiKey: "SUA_CHAVE_AQUI"
          </div>
        </div>
      </div>
    );
  }

  // 1. Monitoramento de Autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u?.email === ADMIN_EMAIL) {
        setViewMode('admin');
      } else {
        setViewMode('public');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Sincronização de Dados em Tempo Real
  useEffect(() => {
    if (!user) return;

    const billsCol = collection(db, 'artifacts', appId, 'public', 'data', 'bills');
    const residentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'residents');
    const caixinhaCol = collection(db, 'artifacts', appId, 'public', 'data', 'caixinha');

    const unsubBills = onSnapshot(billsCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill));
      setBills(data.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => console.error("Erro nas contas:", err));

    const unsubResidents = onSnapshot(residentsCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Resident));
      if (data.length === 0 && isAdmin) {
        initializeResidents();
      } else {
        setResidents(data.sort((a, b) => a.index - b.index));
      }
    }, (err) => console.error("Erro nos moradores:", err));

    const unsubCaixinha = onSnapshot(caixinhaCol, (snapshot) => {
      setCaixinhaTransactions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CaixinhaTransaction)));
    }, (err) => console.error("Erro na caixinha:", err));

    return () => {
      unsubBills();
      unsubResidents();
      unsubCaixinha();
    };
  }, [user, isAdmin]);

  const login = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Erro no login:", error);
    }
  };

  const logout = () => signOut(auth);

  const initializeResidents = async () => {
    const residentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'residents');
    const defaults = ["Eduardo", "Menon", "Lucas", "Camila", "Júlia", "Saulo"];
    for (let i = 0; i < defaults.length; i++) {
      await addDoc(residentsCol, { name: defaults[i], index: i + 1 });
    }
  };

  // --- Cálculos de Rateio ---
  const totalBills = useMemo(() => bills.reduce((acc, b) => acc + Number(b.value), 0), [bills]);
  const perPerson = useMemo(() => residents.length > 0 ? totalBills / residents.length : 0, [totalBills, residents]);
  const caixinhaBalance = useMemo(() => {
    return caixinhaTransactions.reduce((acc, t) => t.type === 'credit' ? acc + Number(t.value) : acc - Number(t.value), 0);
  }, [caixinhaTransactions]);

  // --- Funções Administrativas ---
  const addBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newBill.description || !newBill.value) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bills'), {
        description: newBill.description,
        value: Number(newBill.value),
        createdAt: Date.now()
      });
      setNewBill({ description: '', value: '' });
    } catch (e) {
      alert("Permissão negada. Verifique as regras do Firebase.");
    }
  };

  const addCaixinhaAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newCaixinha.description || !newCaixinha.value) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'caixinha'), {
      description: newCaixinha.description,
      value: Number(newCaixinha.value),
      type: newCaixinha.type,
      createdAt: Date.now()
    });
    setNewCaixinha({ description: '', value: '', type: 'credit' });
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
    const text = `📊 RESUMO APTO\nTotal: R$ ${totalBills.toFixed(2)}\nRateio: R$ ${perPerson.toFixed(2)}\nCaixinha: R$ ${caixinhaBalance.toFixed(2)}`;
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert("Copiado para o WhatsApp!");
    } catch (e) {
      console.error("Erro ao copiar", e);
    }
    document.body.removeChild(textArea);
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Carregando dados...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-20">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Barra Superior */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-slate-900 text-white rounded-3xl">
              <Users size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Gestão do Apê</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`}></span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {isAdmin ? "Administrador logado" : "Modo Visualização"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!user ? (
              <button onClick={login} className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95">
                <LogIn size={20} /> Entrar com Google
              </button>
            ) : (
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <nav className="flex bg-slate-100 p-1.5 rounded-2xl">
                    <button onClick={() => setViewMode('public')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${viewMode === 'public' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Público</button>
                    <button onClick={() => setViewMode('admin')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${viewMode === 'admin' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Gestão</button>
                  </nav>
                )}
                <div className="flex items-center gap-3 pl-2 border-l border-slate-100">
                   <div className="text-right">
                     <p className="text-[10px] font-black text-slate-900 truncate max-w-[120px]">{user.displayName || user.email}</p>
                     <button onClick={logout} className="text-[9px] font-black text-red-500 uppercase hover:text-red-600 transition-colors">Sair da Conta</button>
                   </div>
                   {user.photoURL && <img src={user.photoURL} alt="Foto" className="w-10 h-10 rounded-2xl border-2 border-white shadow-sm" />}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Dashboard de Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard title="Despesa Total" value={totalBills} icon={<Receipt />} color="blue" />
          <StatCard title="Valor Individual" value={perPerson} icon={<DollarSign />} color="emerald" subtitle={`(${residents.length} pessoas)`} />
          <StatCard title="Saldo Caixinha" value={caixinhaBalance} icon={<PiggyBank />} color={caixinhaBalance < 0 ? "red" : "amber"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            
            {/* Lançamento de Despesa (Exclusivo Admin) */}
            {isAdmin && viewMode === 'admin' && (
              <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in zoom-in duration-500">
                <h2 className="text-xl font-black mb-8 flex items-center gap-3 text-slate-800">
                  <PlusCircle className="text-blue-600" size={24} /> Novo Lançamento
                </h2>
                <form onSubmit={addBill} className="flex flex-col md:flex-row gap-5">
                  <input type="text" placeholder="Descrição (Ex: Internet, Romilda...)" className="flex-1 p-5 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all" value={newBill.description} onChange={e => setNewBill({...newBill, description: e.target.value})} />
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400">R$</span>
                    <input type="number" placeholder="0,00" className="w-full md:w-44 p-5 pl-12 bg-slate-50 border-none rounded-2xl font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all" value={newBill.value} onChange={e => setNewBill({...newBill, value: e.target.value})} />
                  </div>
                  <button type="submit" className="bg-blue-600 text-white px-10 py-5 rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">ADICIONAR</button>
                </form>
              </section>
            )}

            {/* Listagem de Despesas */}
            <section className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Histórico de Gastos</h2>
                <button onClick={copyToClipboard} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all active:scale-90">
                  <Download size={22} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-10 py-6">Descrição da Conta</th>
                      <th className="px-10 py-6">Valor Individual</th>
                      {isAdmin && viewMode === 'admin' && <th className="px-10 py-6 text-right">Ação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bills.length === 0 ? (
                      <tr><td colSpan={3} className="px-10 py-20 text-center text-slate-300 italic font-medium">Nenhum gasto registrado para este período.</td></tr>
                    ) : (
                      bills.map(bill => (
                        <tr key={bill.id} className="hover:bg-blue-50/20 transition-colors group">
                          <td className="px-10 py-6">
                            <p className="font-black text-slate-700 text-lg">{bill.description}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Registrado em {new Date(bill.createdAt).toLocaleDateString()}</p>
                          </td>
                          <td className="px-10 py-6 font-mono font-black text-slate-900 text-xl">R$ {Number(bill.value).toFixed(2)}</td>
                          {isAdmin && viewMode === 'admin' && (
                            <td className="px-10 py-6 text-right">
                              <button onClick={() => removeBill(bill.id)} className="bg-red-50 text-red-400 p-3 rounded-xl hover:text-red-600 hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100 active:scale-90">
                                <Trash2 size={20} />
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

          <div className="space-y-10">
            {/* Lista de Moradores */}
            <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
              <h2 className="text-xl font-black mb-8 text-slate-800 uppercase tracking-tight flex items-center gap-3">
                <Users className="text-blue-600" size={24} /> Moradores
              </h2>
              <div className="space-y-4">
                {residents.map(res => (
                  <div key={res.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-blue-100 transition-all group">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xs font-black text-blue-600 shadow-sm border border-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      {res.index}
                    </div>
                    {isAdmin && viewMode === 'admin' ? (
                      <input 
                        type="text" 
                        value={res.name} 
                        onChange={(e) => updateResidentName(res.id, e.target.value)} 
                        className="flex-1 bg-transparent font-black text-slate-700 outline-none focus:text-blue-600 text-lg"
                      />
                    ) : (
                      <span className="font-black text-slate-700 text-lg">{res.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Controle da Caixinha (Admin apenas) */}
            {isAdmin && viewMode === 'admin' && (
              <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 duration-700">
                <h2 className="text-xl font-black mb-8 text-amber-500 uppercase tracking-tight flex items-center gap-3">
                  <PiggyBank size={24} /> Gestão Caixinha
                </h2>
                <form onSubmit={addCaixinhaAction} className="space-y-5">
                  <input type="text" placeholder="Motivo da movimentação..." className="w-full p-5 bg-slate-50 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-amber-50 transition-all" value={newCaixinha.description} onChange={e => setNewCaixinha({...newCaixinha, description: e.target.value})} />
                  <div className="flex gap-3">
                    <input type="number" placeholder="Valor" className="w-2/3 p-5 bg-slate-50 rounded-2xl font-black outline-none focus:ring-4 focus:ring-amber-50 transition-all" value={newCaixinha.value} onChange={e => setNewCaixinha({...newCaixinha, value: e.target.value})} />
                    <select className="w-1/3 p-4 bg-slate-100 rounded-2xl font-black text-[10px] outline-none cursor-pointer hover:bg-slate-200 transition-colors" value={newCaixinha.type} onChange={e => setNewCaixinha({...newCaixinha, type: e.target.value as any})}>
                      <option value="credit">ENTRADA</option>
                      <option value="debit">SAÍDA</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-amber-500 text-white p-5 rounded-2xl font-black hover:bg-amber-600 transition-all shadow-xl shadow-amber-100 active:scale-95">REGISTRAR NA CAIXINHA</button>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, subtitle }) => {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600"
  };

  return (
    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 hover:scale-[1.02] transition-all group">
      <div className="flex items-center gap-6">
        <div className={`p-5 rounded-3xl transition-transform group-hover:rotate-12 ${colorMap[color]}`}>
          {React.cloneElement(icon as React.ReactElement<any>, { size: 32 })}
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 leading-none">
            {title} {subtitle && <span className="lowercase font-bold opacity-60"> {subtitle}</span>}
          </p>
          <h3 className="text-3xl font-black text-slate-900 font-mono tracking-tighter leading-none">
            R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
        </div>
      </div>
    </div>
  );
};

export default App;
