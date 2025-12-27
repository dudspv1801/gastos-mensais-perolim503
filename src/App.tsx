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
  orderBy,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type User,
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
  value: number;
  createdAt: number;
  type: BillType;
  monthId: string; // Ex: "2023-12"
  isPaid: boolean;
  paidAt?: number;
  targetResidentId?: string;
}

interface ReceiptStatus {
  id: string; // residentId_monthId
  residentId: string;
  monthId: string;
  received: boolean;
  receivedAt?: number;
}

interface CaixinhaTransaction {
  id: string;
  description: string;
  value: number;
  type: 'credit' | 'debit';
  createdAt: number;
}

// --- Configuração do Firebase Oficial ---
const firebaseConfig = {
  apiKey: 'AIzaSyBJDYaUNTJjkW46FV0kBaameQyJ1JHr6u8',
  authDomain: 'gestor-de-contas-b546e.firebaseapp.com',
  projectId: 'gestor-de-contas-b546e',
  storageBucket: 'gestor-de-contas-b546e.firebasestorage.app',
  messagingSenderId: '980131809506',
  appId: '1:980131809506:web:7ef3e90c1853bdf12d36bb',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Atualizado o ID para reflectir a mudança de nome na inicialização
const APTO_ID = 'apartamento-historico-v6';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [receipts, setReceipts] = useState<ReceiptStatus[]>([]);
  const [caixinhaTransactions, setCaixinhaTransactions] = useState<
    CaixinhaTransaction[]
  >([]);

  // Controle de Mês
  const [selectedDate, setSelectedDate] = useState(new Date());
  const currentMonthId = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(
      selectedDate.getMonth() + 1
    ).padStart(2, '0')}`;
  }, [selectedDate]);

  const [newBill, setNewBill] = useState<{
    description: string;
    value: string;
    type: BillType;
    targetId: string;
  }>({
    description: '',
    value: '',
    type: 'shared',
    targetId: 'all',
  });

  const [newCaixinha, setNewCaixinha] = useState<{
    description: string;
    value: string;
    type: 'credit' | 'debit';
  }>({
    description: '',
    value: '',
    type: 'credit',
  });

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error(e);
        }
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) return;
    const billsRef = collection(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'bills'
    );
    const residentsRef = collection(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'residents'
    );
    const receiptsRef = collection(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'receipts'
    );
    const caixinhaRef = collection(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'caixinha'
    );

    const unsubBills = onSnapshot(
      query(billsRef, orderBy('createdAt', 'desc')),
      (s) => setAllBills(s.docs.map((d) => ({ ...d.data(), id: d.id } as Bill)))
    );

    const unsubResidents = onSnapshot(
      query(residentsRef, orderBy('index', 'asc')),
      (s) => {
        const data = s.docs.map((d) => ({ ...d.data(), id: d.id } as Resident));
        if (data.length === 0) setupDefaultResidents();
        else setResidents(data);
      }
    );

    const unsubReceipts = onSnapshot(receiptsRef, (s) =>
      setReceipts(
        s.docs.map((d) => ({ ...d.data(), id: d.id } as ReceiptStatus))
      )
    );

    const unsubCaixinha = onSnapshot(
      query(caixinhaRef, orderBy('createdAt', 'desc')),
      (s) =>
        setCaixinhaTransactions(
          s.docs.map((d) => ({ ...d.data(), id: d.id } as CaixinhaTransaction))
        )
    );

    return () => {
      unsubBills();
      unsubResidents();
      unsubReceipts();
      unsubCaixinha();
    };
  }, [user]);

  const setupDefaultResidents = async () => {
    const residentsRef = collection(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'residents'
    );
    const defaults = [
      { name: 'Eduardo', weight: 1.0 },
      { name: 'Menon', weight: 1.0 },
      { name: 'Lucas', weight: 1.0 },
      { name: 'Camila', weight: 0.65 },
      { name: 'Júlia', weight: 0.65 },
      { name: 'Saulo', weight: 0.6 },
    ];
    for (let i = 0; i < defaults.length; i++) {
      await addDoc(residentsRef, {
        name: defaults[i].name,
        rentWeight: defaults[i].weight,
        index: i,
      });
    }
  };

  // Filtragem de Dados pelo Mês selecionado
  const bills = useMemo(
    () => allBills.filter((b) => b.monthId === currentMonthId),
    [allBills, currentMonthId]
  );

  // --- Cálculos Matemáticos ---
  const totals = useMemo(() => {
    const totalWeight = residents.reduce(
      (acc, r) => acc + (Number(r.rentWeight) || 0),
      0
    );
    const totalRent = bills
      .filter((b) => b.type === 'rent')
      .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
    const totalShared = bills
      .filter((b) => b.type === 'shared')
      .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
    const totalParking = bills
      .filter((b) => b.type === 'parking')
      .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
    const totalHouseSupplies = bills
      .filter((b) => b.type === 'house_supplies')
      .reduce((acc, b) => acc + (Number(b.value) || 0), 0);

    const rentPerWeight = totalWeight > 0 ? totalRent / totalWeight : 0;
    const sharedPerPerson =
      residents.length > 0
        ? (totalShared + totalHouseSupplies) / residents.length
        : 0;

    const breakdown = residents.map((res) => {
      let totalToPayToManager = 0;
      const rentShare = (Number(res.rentWeight) || 0) * rentPerWeight;
      totalToPayToManager += rentShare;
      totalToPayToManager += sharedPerPerson;

      // Estacionamento associado ao Eduardo
      const parkingShare = res.name === 'Eduardo' ? totalParking : 0;
      totalToPayToManager += parkingShare;

      const individualCharges = bills
        .filter((b) => b.type === 'individual' && b.targetResidentId === res.id)
        .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
      totalToPayToManager += individualCharges;
      let creditHouseSupplies = 0;
      if (res.name === 'Menon') {
        creditHouseSupplies = totalHouseSupplies;
        totalToPayToManager -= creditHouseSupplies;
      }

      // Status de Recebimento
      const receipt = receipts.find(
        (rec) => rec.residentId === res.id && rec.monthId === currentMonthId
      );

      return {
        ...res,
        rentShare,
        sharedShare: sharedPerPerson,
        parkingShare,
        individualCharges,
        creditHouseSupplies,
        total: totalToPayToManager,
        isReceived: receipt?.received || false,
        receivedAt: receipt?.receivedAt,
      };
    });

    return {
      breakdown,
      totalApto:
        totalRent +
        totalShared +
        totalParking +
        totalHouseSupplies +
        bills
          .filter((b) => b.type === 'individual')
          .reduce((acc, b) => acc + (Number(b.value) || 0), 0),
    };
  }, [residents, bills, receipts, currentMonthId]);

  const caixinhaBalance = useMemo(() => {
    return caixinhaTransactions.reduce(
      (acc, t) =>
        t.type === 'credit'
          ? acc + (Number(t.value) || 0)
          : acc - (Number(t.value) || 0),
      0
    );
  }, [caixinhaTransactions]);

  // --- Handlers Interativos ---
  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBill.description || !newBill.value) return;
    const billData: any = {
      description: newBill.description,
      value: parseFloat(newBill.value),
      type: newBill.type,
      monthId: currentMonthId,
      isPaid: false,
      createdAt: Date.now(),
    };
    if (newBill.type === 'individual' && newBill.targetId !== 'all') {
      billData.targetResidentId = newBill.targetId;
    }
    await addDoc(
      collection(db, 'artifacts', APTO_ID, 'public', 'data', 'bills'),
      billData
    );
    setNewBill({ ...newBill, description: '', value: '', targetId: 'all' });
  };

  const toggleBillPaid = async (bill: Bill) => {
    const billRef = doc(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'bills',
      bill.id
    );
    await updateDoc(billRef, {
      isPaid: !bill.isPaid,
      paidAt: !bill.isPaid ? Date.now() : null,
    });
  };

  const toggleReceiptStatus = async (res: any) => {
    const receiptId = `${res.id}_${currentMonthId}`;
    const receiptRef = doc(
      db,
      'artifacts',
      APTO_ID,
      'public',
      'data',
      'receipts',
      receiptId
    );
    await setDoc(
      receiptRef,
      {
        residentId: res.id,
        monthId: currentMonthId,
        received: !res.isReceived,
        receivedAt: !res.isReceived ? Date.now() : null,
      },
      { merge: true }
    );
  };

  const handleAddCaixinha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaixinha.description || !newCaixinha.value) return;
    await addDoc(
      collection(db, 'artifacts', APTO_ID, 'public', 'data', 'caixinha'),
      {
        description: newCaixinha.description,
        value: parseFloat(newCaixinha.value),
        type: newCaixinha.type,
        createdAt: Date.now(),
      }
    );
    setNewCaixinha({ description: '', value: '', type: 'credit' });
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setSelectedDate(newDate);
  };

  const copySummary = () => {
    let text = `📊 *FECHAMENTO ${currentMonthId.replace('-', '/')}*\n\n`;
    text += `📝 *CONTAS DO MÊS:*\n`;
    bills.forEach((b) => {
      text += `${b.isPaid ? '✅' : '❌'} ${b.description}: R$ ${b.value.toFixed(
        2
      )}\n`;
    });
    text += `\n👥 *VALORES FINAIS:*\n`;
    totals.breakdown.forEach((r) => {
      text += `*${r.name.toUpperCase()}*: R$ ${r.total.toFixed(2)} ${
        r.isReceived ? '(PAGO ✅)' : '(PENDENTE ⏳)'
      }\n`;
    });
    text += `\n💰 *TOTAL:* R$ ${totals.totalApto.toFixed(2)}`;
    navigator.clipboard.writeText(text);
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-800 font-sans antialiased">
      <div className="max-w-6xl mx-auto">
        {/* Navigation & Header */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 bg-white p-2 rounded-[1.5rem] shadow-sm border border-slate-100">
            <button
              onClick={() => changeMonth(-1)}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <ChevronLeft />
            </button>
            <div className="flex flex-col items-center px-6 min-w-[150px]">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                Período
              </span>
              <span className="text-xl font-black text-slate-900 capitalize">
                {selectedDate.toLocaleString('pt-BR', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
            <button
              onClick={() => changeMonth(1)}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <ChevronRight />
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={copySummary}
              className="bg-slate-900 text-white px-8 py-4 rounded-[1.5rem] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-200"
            >
              <Download size={20} /> Resumo WhatsApp
            </button>
          </div>
        </header>

        {/* Dash Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard
            title="Total do Mês"
            value={totals.totalApto}
            icon={<Receipt />}
            theme="dark"
          />
          <StatCard
            title="A receber (Eduardo)"
            value={totals.breakdown.reduce(
              (acc, r) => acc + (!r.isReceived ? r.total : 0),
              0
            )}
            icon={<Clock />}
            theme="emerald"
          />
          <StatCard
            title="Saldo Caixinha"
            value={caixinhaBalance}
            icon={<PiggyBank />}
            theme="amber"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            {/* Lançamento Form */}
            <section className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
              <h2 className="text-2xl font-black mb-8 flex items-center gap-3 text-slate-800">
                <PlusCircle className="text-blue-600" size={28} /> Novo
                Lançamento em {currentMonthId}
              </h2>
              <form onSubmit={handleAddBill} className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <input
                    className="flex-1 p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 font-bold"
                    placeholder="Descrição (ex: Aluguel...)"
                    value={newBill.description}
                    onChange={(e) =>
                      setNewBill({ ...newBill, description: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-full md:w-44 p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 font-black"
                    placeholder="R$ 0,00"
                    value={newBill.value}
                    onChange={(e) =>
                      setNewBill({ ...newBill, value: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <select
                    className="flex-1 p-4 bg-slate-100 rounded-2xl font-bold text-xs"
                    value={newBill.type}
                    onChange={(e) =>
                      setNewBill({
                        ...newBill,
                        type: e.target.value as BillType,
                      })
                    }
                  >
                    <option value="shared">
                      Dividido por 6 (Luz/Internet)
                    </option>
                    <option value="house_supplies">
                      Compras Casa (Menon 🛒)
                    </option>
                    <option value="rent">Aluguel (Proporcional 🏠)</option>
                    <option value="parking">Garagem (Só Eduardo 🚗)</option>
                    <option value="individual">Extra Individual 👤</option>
                  </select>
                  {newBill.type === 'individual' && (
                    <select
                      className="flex-1 p-4 bg-blue-50 text-blue-700 rounded-2xl font-bold text-xs"
                      value={newBill.targetId}
                      onChange={(e) =>
                        setNewBill({ ...newBill, targetId: e.target.value })
                      }
                    >
                      <option value="all">Escolha o morador...</option>
                      {residents.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    LANÇAR
                  </button>
                </div>
              </form>
            </section>

            {/* Controle de Recebimento de Moradores */}
            <section className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <Users className="text-emerald-500" /> Recebimentos (Eduardo x
                  Colegas)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-10 py-6">Morador</th>
                      <th className="px-10 py-6">Valor Devido</th>
                      <th className="px-10 py-6">Status</th>
                      <th className="px-10 py-6 text-right">Confirmar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {totals.breakdown.map((res) => (
                      <tr
                        key={res.id}
                        className={`transition-colors ${
                          res.isReceived
                            ? 'bg-emerald-50/30'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="px-10 py-6">
                          <span className="font-black text-slate-700 text-lg">
                            {res.name}
                          </span>
                          {res.isReceived && (
                            <p className="text-[9px] text-emerald-600 font-bold uppercase mt-1">
                              Pago em:{' '}
                              {new Date(res.receivedAt!).toLocaleString()}
                            </p>
                          )}
                        </td>
                        <td className="px-10 py-6 font-mono font-bold text-slate-600">
                          R$ {res.total.toFixed(2)}
                        </td>
                        <td className="px-10 py-6">
                          {res.isReceived ? (
                            <span className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
                              <CheckCircle2 size={16} /> Recebido
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                              <Clock size={16} /> Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-10 py-6 text-right">
                          <button
                            onClick={() => toggleReceiptStatus(res)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                              res.isReceived
                                ? 'bg-red-50 text-red-500 hover:bg-red-100'
                                : 'bg-emerald-500 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-600'
                            }`}
                          >
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
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-2">
                <Receipt size={22} className="text-blue-600" /> Contas a Pagar
              </h2>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {bills.map((bill) => (
                  <div
                    key={bill.id}
                    className={`p-5 rounded-3xl border transition-all relative group ${
                      bill.isPaid
                        ? 'bg-slate-100/50 border-transparent opacity-60'
                        : 'bg-white border-slate-100 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p
                          className={`text-sm font-black ${
                            bill.isPaid
                              ? 'text-slate-400 line-through'
                              : 'text-slate-800'
                          }`}
                        >
                          {bill.description}
                        </p>
                        <span className="text-[8px] uppercase font-black text-slate-400">
                          Total: R$ {bill.value.toFixed(2)}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleBillPaid(bill)}
                        className={`p-2 rounded-xl transition-all ${
                          bill.isPaid
                            ? 'text-emerald-500 bg-emerald-50'
                            : 'text-slate-300 hover:text-blue-500 bg-slate-50'
                        }`}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </div>
                    {bill.isPaid && (
                      <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                        <Clock size={10} /> Pago em{' '}
                        {new Date(bill.paidAt!).toLocaleDateString()}
                      </p>
                    )}
                    <button
                      onClick={() =>
                        deleteDoc(
                          doc(
                            db,
                            'artifacts',
                            APTO_ID,
                            'public',
                            'data',
                            'bills',
                            bill.id
                          )
                        )
                      }
                      className="absolute top-2 right-2 p-1 text-red-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {bills.length === 0 && (
                  <div className="text-center py-10 text-slate-300 italic text-sm">
                    Nenhuma conta este mês.
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-amber-600">
                <PiggyBank size={24} /> Caixinha
              </h2>
              <form onSubmit={handleAddCaixinha} className="space-y-3">
                <input
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none text-xs font-bold border-none"
                  placeholder="Motivo..."
                  value={newCaixinha.description}
                  onChange={(e) =>
                    setNewCaixinha({
                      ...newCaixinha,
                      description: e.target.value,
                    })
                  }
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none font-black text-xs border-none"
                    placeholder="R$"
                    value={newCaixinha.value}
                    onChange={(e) =>
                      setNewCaixinha({ ...newCaixinha, value: e.target.value })
                    }
                  />
                  <select
                    className="p-4 bg-slate-100 rounded-2xl font-bold text-[10px] border-none"
                    value={newCaixinha.type}
                    onChange={(e) =>
                      setNewCaixinha({
                        ...newCaixinha,
                        type: e.target.value as 'credit' | 'debit',
                      })
                    }
                  >
                    <option value="credit">Entrada</option>
                    <option value="debit">Saída</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 shadow-lg shadow-amber-100"
                >
                  Registrar
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  theme,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  theme: string;
}) {
  const themes: Record<string, string> = {
    dark: 'bg-slate-900 text-white shadow-slate-200',
    emerald: 'bg-white text-slate-900 border-slate-100',
    amber: 'bg-amber-500 text-white shadow-amber-200',
  };
  const isLight = theme === 'emerald';
  return (
    <div
      className={`p-8 rounded-[2.5rem] shadow-xl border flex items-center gap-6 transition-all hover:scale-105 ${themes[theme]}`}
    >
      <div
        className={`p-4 rounded-2xl ${
          isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-white/10 text-white'
        }`}
      >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 28 })}
      </div>
      <div>
        <p
          className={`text-[10px] font-black uppercase tracking-widest ${
            isLight ? 'text-slate-400' : 'text-white/60'
          }`}
        >
          {title}
        </p>
        <h3 className="text-3xl font-black font-mono">
          R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </h3>
      </div>
    </div>
  );
}
