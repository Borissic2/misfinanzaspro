import { createClient } from '@supabase/supabase-js';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, 
  CreditCard, 
  PieChart, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  CheckCircle2,
  BarChart3,
  Scale,
  History,
  Lock,
  User,
  LogOut,
  UserCheck,
  Loader2,
  Calendar,
  AlertCircle,
  Cloud,
  CloudLightning,
  CloudOff
} from 'lucide-react';

// ---- INYECCIÓN DIRECTA DE CONFIGURACIÓN DE SUPABASE ----
const supabaseUrl = 'https://cyrfjkdpzqqwaeznytwk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cmZqa2RwenFxd2Flem55dHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjY3MTksImV4cCI6MjA5ODEwMjcxOX0.BdCqyYdeXyi1JWhACRJvyiTqsWJnDcA3OIcIa32ucc0';

const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

const formatQ = (amount) => {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2
  }).format(amount).replace('GTQ', 'Q');
};

// Carga asíncrona del script CDN oficial de Supabase
const loadSupabaseScript = () => {
  return new Promise((resolve) => {
    if (window.supabase) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
};

export default function App() {
  // ---- CLIENTE SUPABASE REAL ----
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline'); // 'synced', 'syncing', 'offline', 'error'
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  // ---- ESTADOS DE AUTENTICACIÓN ----
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState(''); 
  const [isLoading, setIsLoading] = useState(false);

  // ---- ESTADOS DE LA APLICACIÓN ----
  const [activeTab, setActiveTab] = useState('transacciones'); 
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false); 

  // Estados financieros reales (sincronizados globalmente en JSONB)
  const [debts, setDebts] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]); 
  const [transactions, setTransactions] = useState([]);
  const [monthlyBudget, setMonthlyBudget] = useState(6000); 
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [historyData, setHistoryData] = useState([]); 

  // Estados de formularios financieros
  const [categoryForm, setCategoryForm] = useState({ name: '', estimate: '' });
  const [debtForm, setDebtForm] = useState({ name: '', total: '', monthly: '' });
  const [txForm, setTxForm] = useState({ type: 'ingreso', desc: '', amount: '', category: 'Alimentación' });
  const [paymentInputs, setPaymentInputs] = useState({});

  const isUpdatingRef = useRef(false);
  const isLoadedFromCloudRef = useRef(false); // Bandera crítica de lectura previa

  // ---- 1. INICIALIZACIÓN NATIVA DE SUPABASE ----
  useEffect(() => {
    let subscription = null;

    const initSupabase = async () => {
      const loaded = await loadSupabaseScript();
      
      if (loaded && window.supabase && isSupabaseConfigured) {
        try {
          const clientInstance = createClient(supabaseUrl, supabaseAnonKey);
          setSupabaseClient(clientInstance);
          setSyncStatus('synced');
          setIsClientLoaded(true);

          // Obtener sesión activa real de Supabase
          const { data: { session } } = await clientInstance.auth.getSession();
          if (session) {
            handleUserLogin(session.user, clientInstance);
          }

          // Escuchar cambios de estado nativos en la autenticación
          const { data: authListener } = clientInstance.auth.onAuthStateChange((_event, session) => {
            if (session) {
              handleUserLogin(session.user, clientInstance);
            } else {
              handleUserLogout();
            }
          });
          subscription = authListener?.subscription;

        } catch (e) {
          console.error("Error al conectar directamente con Supabase:", e);
          setSyncStatus('error');
          setAuthError('Fallo de conexión de red con el servidor de Supabase.');
          setIsClientLoaded(true);
        }
      } else {
        setSyncStatus('error');
        setIsClientLoaded(true);
      }
    };

    initSupabase();

    return () => {
      if (subscription && subscription.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const handleUserLogin = (user, client) => {
    const userData = {
      id: user.id,
      email: user.email,
      username: user.user_metadata?.username || user.email.split('@')[0],
      name: user.user_metadata?.name || user.user_metadata?.username || user.email.split('@')[0]
    };
    setCurrentUser(userData);
    setIsLoggedIn(true);
    fetchGlobalUserData(user.id, client);
  };

  const handleUserLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setIsDataLoaded(false);
    isLoadedFromCloudRef.current = false;
    setDebts([]);
    setPaymentHistory([]);
    setTransactions([]);
    setMonthlyBudget(6000);
    setBudgetCategories([]);
    setHistoryData([]);
  };

  // ---- 2. CARGA DE SEGURIDAD DESDE LA NUBE (SELECT ANTES DE ESCRIBIR) ----
  const fetchGlobalUserData = async (userId, clientToUse) => {
    const activeClient = clientToUse || supabaseClient;
    if (!activeClient) return;

    setIsDataLoading(true);
    try {
      const { data, error } = await activeClient
        .from('datos_usuario')
        .select('datos')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data && data.datos) {
        const payload = data.datos;
        isUpdatingRef.current = true; // Bloquea guardado durante la inyección de datos
        setDebts(payload.debts || []);
        setPaymentHistory(payload.paymentHistory || []);
        setTransactions(payload.transactions || []);
        setMonthlyBudget(payload.monthlyBudget ?? 6000);
        setBudgetCategories(payload.budgetCategories || []);
        setHistoryData(payload.historyData || []);
        
        isLoadedFromCloudRef.current = true; // Sincronización de lectura verificada
        setIsDataLoaded(true);
        setTimeout(() => { isUpdatingRef.current = false; }, 300);
      } else {
        // Nuevo usuario en Supabase: Se establece el estado de inicio vacío
        isUpdatingRef.current = true;
        setDebts([]);
        setPaymentHistory([]);
        setTransactions([]);
        setMonthlyBudget(6000);
        setBudgetCategories([]);
        setHistoryData([]);
        
        isLoadedFromCloudRef.current = true; 
        setIsDataLoaded(true);
        setTimeout(() => { isUpdatingRef.current = false; }, 300);
      }
    } catch (err) {
      console.error('Error cargando datos de Supabase:', err.message);
      setAuthError(`No se pudo sincronizar tus datos financieros: ${err.message}`);
      setSyncStatus('error');
    } finally {
      setIsDataLoading(false);
    }
  };

  // ---- 3. GUARDADO AUTOMÁTICO EN SUPABASE CON UPSERT ----
  useEffect(() => {
    // Evitamos sobreescribir datos vacíos o sin autenticación verificada
    if (!isLoggedIn || !currentUser || !isDataLoaded || !isLoadedFromCloudRef.current || !supabaseClient || isUpdatingRef.current) return;

    const timer = setTimeout(async () => {
      setSyncStatus('syncing');
      
      const payload = {
        debts,
        paymentHistory,
        transactions,
        monthlyBudget,
        budgetCategories,
        historyData
      };

      try {
        const { error } = await supabaseClient
          .from('datos_usuario')
          .upsert({
            user_id: currentUser.id,
            datos: payload,
          }, { onConflict: 'user_id' });

        if (error) throw error;
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error sincronizando estado general:', err.message);
        setSyncStatus('error');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [debts, paymentHistory, transactions, monthlyBudget, budgetCategories, historyData, isLoggedIn, currentUser, isDataLoaded]);


  // ---- MANEJADORES DE AUTENTICACIÓN DIRECTOS DE SUPABASE ----

  // Inicio de Sesión NATIVO
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    
    if (!supabaseClient) {
      setAuthError('Error: El cliente de Supabase no se ha inicializado.');
      return;
    }

    const emailReal = authForm.username.trim().toLowerCase(); 
    const password = authForm.password;

    if (!authForm.username || !password) {
      setAuthError('Ingresa tu nombre de usuario y contraseña.');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: emailReal,
        password: password,
      });
      if (error) throw error;
      setAuthForm({ username: '', password: '', name: '' });
    } catch (error) {
      // Captura y expone en rojo el error real devuelto por la red de Supabase
      setAuthError(error.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  // Registro NATIVO
  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');

    if (!supabaseClient) {
      setAuthError('Error: El cliente de Supabase no se ha inicializado.');
      return;
    }

    const emailReal = authForm.username.trim().toLowerCase();
    const password = authForm.password;

    if (!authForm.username || !password || !authForm.name.trim()) {
      setAuthError('Todos los campos son obligatorios para el registro.');
      return;
    }

    if (password.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: emailReal,
        password: password,
        options: {
          data: {
            name: authForm.name.trim(),
            username: authForm.username.trim().toLowerCase()
          }
        }
      });
      if (error) throw error;

      // Inicializar el espacio del usuario nuevo en Supabase de manera limpia
      if (data && data.user) {
        const { error: dbErr } = await supabaseClient.from('datos_usuario').upsert({
          user_id: data.user.id,
          datos: {
            debts: [],
            paymentHistory: [],
            transactions: [],
            monthlyBudget: 6000,
            budgetCategories: [],
            historyData: []
          }
        }, { onConflict: 'user_id' });
        
        if (dbErr) throw dbErr;
      }

      setAuthSuccessMsg('¡Usuario registrado de forma exitosa en Supabase! Ya puedes iniciar sesión.');
      setAuthForm({ username: '', password: '', name: '' });
      setAuthMode('login'); 
    } catch (error) {
      // Captura y expone en rojo el error devuelto por la base de datos de Supabase
      setAuthError(error.message || 'Error al procesar el registro en el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  };

  // ---- MANEJADORES FINANCIEROS REALES ----

  const handleAddTx = (e) => {
    e.preventDefault();
    if (!txForm.desc || !txForm.amount) return;

    const newTx = {
      id: 'tx_' + Math.random().toString(36).substr(2, 9),
      type: txForm.type,
      description: txForm.desc,
      amount: parseFloat(txForm.amount),
      category: txForm.type === 'ingreso' ? 'Ingreso' : txForm.category,
      date: new Date().toISOString().split('T')[0]
    };

    setTransactions([newTx, ...transactions]);
    setTxForm({ 
      type: 'ingreso', 
      desc: '', 
      amount: '', 
      category: budgetCategories[0]?.name || 'Otros (No planificados)' 
    });
  };

  const handleDeleteTx = (id) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const handleAddDebt = (e) => {
    e.preventDefault();
    if (!debtForm.name || !debtForm.total || !debtForm.monthly) return;
    
    const newDebt = {
      id: 'debt_' + Math.random().toString(36).substr(2, 9),
      name: debtForm.name,
      total_amount: parseFloat(debtForm.total),
      balance: parseFloat(debtForm.total),
      monthly_payment: parseFloat(debtForm.monthly),
      total_paid: 0
    };
    
    setDebts([newDebt, ...debts]);
    setDebtForm({ name: '', total: '', monthly: '' });
  };

  const handlePayDebt = (id) => {
    const amountToPay = parseFloat(paymentInputs[id]);
    if (!amountToPay || amountToPay <= 0) return;

    const debt = debts.find(d => d.id === id);
    if (!debt) return;

    const newBalance = Math.max(0, debt.balance - amountToPay);
    const addedToPaid = debt.balance - newBalance; 
    const newTotalPaid = debt.total_paid + addedToPaid;

    setDebts(debts.map(d => d.id === id ? { ...d, balance: newBalance, total_paid: newTotalPaid } : d));

    const newPaymentLog = {
      id: 'pay_' + Math.random().toString(36).substr(2, 9),
      debt_name: debt.name,
      amount_paid: addedToPaid,
      payment_date: new Date().toISOString().split('T')[0]
    };
    setPaymentHistory([newPaymentLog, ...paymentHistory]);

    const autoExpense = {
      id: 'tx_' + Math.random().toString(36).substr(2, 9),
      type: 'gasto',
      description: `Abono a Deuda: ${debt.name}`,
      amount: addedToPaid,
      category: 'Abono de Deudas',
      date: new Date().toISOString().split('T')[0]
    };
    setTransactions([autoExpense, ...transactions]);

    setPaymentInputs({ ...paymentInputs, [id]: '' });
  };

  const handleDeleteDebt = (id) => {
    const debt = debts.find(d => d.id === id);
    setDebts(debts.filter(d => d.id !== id));
    if (debt) {
      setPaymentHistory(paymentHistory.filter(p => p.debt_name !== debt.name));
    }
  };

  const handleAddCategory = (e) => {
    e.preventDefault();
    if (!categoryForm.name || !categoryForm.estimate) return;

    const newCat = {
      id: 'cat_' + Math.random().toString(36).substr(2, 9),
      name: categoryForm.name,
      estimate: parseFloat(categoryForm.estimate)
    };

    setBudgetCategories([...budgetCategories, newCat]);
    setCategoryForm({ name: '', estimate: '' });
  };

  const handleDeleteCategory = (id) => {
    setBudgetCategories(budgetCategories.filter(c => c.id !== id));
  };

  const handleBudgetChange = (val) => {
    setMonthlyBudget(parseFloat(val) || 0);
  };


  // ---- CÁLCULOS GENERALES DE LA INTERFAZ ----
  const totalIncomes = transactions.filter(t => t.type === 'ingreso').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'gasto').reduce((acc, curr) => acc + curr.amount, 0);
  const cashFlowBalance = totalIncomes - totalExpenses;
  const spentPercentage = totalIncomes > 0 ? Math.min(100, (totalExpenses / totalIncomes) * 100) : 0;

  const currentTotalDebt = debts.reduce((acc, curr) => acc + curr.balance, 0);
  const globalTotalDebtAmount = debts.reduce((acc, curr) => acc + curr.total_amount, 0);
  const globalTotalPaid = debts.reduce((acc, curr) => acc + curr.total_paid, 0);
  const globalDebtProgress = globalTotalDebtAmount > 0 ? (globalTotalPaid / globalTotalDebtAmount) * 100 : 0;

  const totalEstimatedExpenses = budgetCategories.reduce((acc, curr) => acc + curr.estimate, 0);
  const remainingBudget = monthlyBudget - totalEstimatedExpenses;

  const getRealSpentByCategory = (categoryName) => {
    return transactions
      .filter(t => t.type === 'gasto' && t.category === categoryName)
      .reduce((acc, curr) => acc + curr.amount, 0);
  };

  const nonPlannedSpent = transactions
    .filter(t => t.type === 'gasto' && t.category !== 'Abono de Deudas' && (t.category === 'Otros (No planificados)' || !budgetCategories.some(c => c.name === t.category)))
    .reduce((acc, curr) => acc + curr.amount, 0);

  const categoriesMatchedCount = budgetCategories.filter(cat => {
    const realSpent = getRealSpentByCategory(cat.name);
    return realSpent <= cat.estimate && realSpent > 0;
  }).length;
  
  const totalActivePlanCategories = budgetCategories.length;
  const complianceScore = totalActivePlanCategories > 0 
    ? Math.round((categoriesMatchedCount / totalActivePlanCategories) * 100) 
    : 100;

  const currentMonthData = {
    month: 'Junio 2026 (Actual)',
    ingresos: totalIncomes,
    gastos: totalExpenses,
    deudas: currentTotalDebt
  };

  const allMonthsHistory = [...historyData, currentMonthData];
  const maxHistoricalValue = Math.max(...allMonthsHistory.flatMap(m => [m.ingresos, m.gastos, m.deudas]), 1);
  const initialDebt = historyData[0]?.deudas || 0;
  const debtReductionPercent = initialDebt > 0 ? ((initialDebt - currentTotalDebt) / initialDebt) * 100 : 0;


  // ---- CARGANDO CONFIGURACIÓN ----
  if (!isClientLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center text-white">
        <Loader2 className="w-12 h-12 animate-spin mb-4 text-emerald-500" />
        <p className="font-semibold text-sm">Cargando módulos de seguridad Supabase...</p>
      </div>
    );
  }

  // ---- ALERTA: CREDENCIALES DE NUBE NO ENCONTRADAS ----
  if (syncStatus === 'error' && !isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-center p-6 text-white">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-lg shadow-2xl border border-red-500/40 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-3 text-red-300">Variables de Entorno Vacías</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            No se han configurado las llaves de Supabase en tu entorno de StackBlitz o Vercel. 
            La aplicación en la nube requiere las credenciales reales para conectarse de forma nativa.
          </p>
          <div className="bg-slate-950 p-4 rounded-lg text-left text-xs text-emerald-400 font-mono select-all">
            <p># Agrega esto en tu archivo .env en Vercel/StackBlitz:</p>
            <p>VITE_SUPABASE_URL=tu_url_real_de_supabase</p>
            <p>VITE_SUPABASE_ANON_KEY=tu_anon_key_real</p>
          </div>
          <p className="text-slate-400 text-xs mt-6 leading-relaxed">
            Sube tu configuración en las variables del proyecto y refresca el sitio para continuar con el inicio de sesión global.
          </p>
        </div>
      </div>
    );
  }

  // ---- PANTALLA DE ACCESO (LOGIN) ----
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-800 via-teal-900 to-cyan-950 flex flex-col justify-center items-center p-4">
        
        <div className="text-center mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white/10 p-4 rounded-3xl inline-block mb-3 backdrop-blur-md border border-white/20">
            <Wallet className="w-12 h-12 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Mis Finanzas Pro</h1>
          <p className="text-emerald-300 text-sm mt-1">Conexión 100% nativa con base de datos Supabase en la nube</p>
        </div>

        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-300">
          <div className="flex justify-center mb-6">
            <div className="flex bg-gray-100 p-1 rounded-lg w-full">
              <button 
                onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccessMsg(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${authMode === 'login' ? 'bg-white border-t-2 border-t-emerald-600 border-x border-gray-200 text-emerald-700 font-bold' : 'text-gray-500 hover:text-emerald-600'}`}
              >
                Iniciar Sesión
              </button>
              <button 
                onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthSuccessMsg(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${authMode === 'signup' ? 'bg-white border-t-2 border-t-emerald-600 border-x border-gray-200 text-emerald-700 font-bold' : 'text-gray-500 hover:text-emerald-600'}`}
              >
                Registrarse
              </button>
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {authMode === 'login' ? '¡Bienvenido de vuelta!' : 'Crea tu cuenta global'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {authMode === 'login' ? 'Tus datos se sincronizarán de forma segura en la base de datos.' : 'Planifica inteligentemente desde cualquier dispositivo.'}
          </p>

          {authError && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs font-semibold mb-4 border border-red-200 flex items-center gap-2 animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccessMsg && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-xs font-semibold mb-4 border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{authSuccessMsg}</span>
            </div>
          )}

          {/* FORMULARIOS SEPARADOS CON MÉTODOS DE ENVÍO DIRECTOS */}
          <form onSubmit={authMode === 'login' ? handleLoginSubmit : handleSignupSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre Completo</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <input 
                    type="text" 
                    required
                    value={authForm.name} 
                    onChange={e => setAuthForm({...authForm, name: e.target.value})} 
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                    placeholder="Tu nombre completo" 
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre de Usuario</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <User className="w-4 h-4" />
                </span>
                <input 
                  type="text" 
                  required 
                  value={authForm.username} 
                  onChange={e => setAuthForm({...authForm, username: e.target.value})} 
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                  placeholder="Escribe tu usuario" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Contraseña</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  type="password" 
                  required 
                  value={authForm.password} 
                  onChange={e => setAuthForm({...authForm, password: e.target.value})} 
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                  placeholder="••••••" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg text-sm transition-colors shadow-md hover:shadow-lg flex justify-center items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                authMode === 'login' ? 'Ingresar al Tablero' : 'Crear Cuenta y Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center flex flex-col items-center justify-center gap-2">
            <span className="text-[10px] text-gray-400 leading-normal max-w-xs block font-medium">
              Tus finanzas se guardarán globalmente en la columna JSONB en la nube asociada a tu User ID de Supabase.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ---- TABLERO PRINCIPAL ----
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-12">
      {/* Header */}
      <header className="bg-emerald-700 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Wallet className="w-7 h-7" />
              Mis Finanzas Pro
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-emerald-100 text-[10px] md:text-xs">
                Sesión: <span className="font-semibold text-white">{currentUser?.name}</span> (@{currentUser?.username})
              </p>
              <span className="text-gray-300">|</span>
              {/* Indicador de Sincronización */}
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs">
                {syncStatus === 'synced' && (
                  <span className="flex items-center gap-1 bg-emerald-800 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    <Cloud className="w-3.5 h-3.5" /> Nube Sincronizada
                  </span>
                )}
                {syncStatus === 'syncing' && (
                  <span className="flex items-center gap-1 bg-amber-800 text-amber-200 px-2 py-0.5 rounded-full font-bold animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando en la nube...
                  </span>
                )}
                {syncStatus === 'error' && (
                  <span className="flex items-center gap-1 bg-red-800 text-red-200 px-2 py-0.5 rounded-full font-bold">
                    <CloudLightning className="w-3.5 h-3.5" /> Error de Conexión
                  </span>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="flex flex-wrap gap-1 md:space-x-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('transacciones')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs md:text-sm rounded-t-lg transition-colors ${activeTab === 'transacciones' ? 'bg-white border-t-2 border-t-emerald-600 border-x border-gray-200 text-emerald-700 font-bold' : 'text-gray-500 hover:text-emerald-600 hover:bg-gray-100'}`}
          >
            <TrendingUp className="w-4 h-4" />
            Gastos e Ingresos
          </button>
          <button
            onClick={() => setActiveTab('deudas')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs md:text-sm rounded-t-lg transition-colors ${activeTab === 'deudas' ? 'bg-white border-t-2 border-t-emerald-600 border-x border-gray-200 text-emerald-700 font-bold' : 'text-gray-500 hover:text-emerald-600 hover:bg-gray-100'}`}
          >
            <CreditCard className="w-4 h-4" />
            Deudas
          </button>
          <button
            onClick={() => setActiveTab('presupuesto')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs md:text-sm rounded-t-lg transition-colors ${activeTab === 'presupuesto' ? 'bg-white border-t-2 border-t-emerald-600 border-x border-gray-200 text-emerald-700 font-bold' : 'text-gray-500 hover:text-emerald-600 hover:bg-gray-100'}`}
          >
            <PieChart className="w-4 h-4" />
            Presupuesto
          </button>
          <button
            onClick={() => setActiveTab('comparacion')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs md:text-sm rounded-t-lg transition-colors ${activeTab === 'comparacion' ? 'bg-white border-t-2 border-t-emerald-600 border-x border-gray-200 text-emerald-700 font-bold' : 'text-gray-500 hover:text-emerald-600 hover:bg-gray-100'}`}
          >
            <Scale className="w-4 h-4" />
            Comparación & Match
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs md:text-sm rounded-t-lg transition-colors ${activeTab === 'historico' ? 'bg-white border-t-2 border-t-indigo-600 border-x border-gray-200 text-indigo-700 font-bold' : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100'}`}
          >
            <History className="w-4 h-4" />
            Historial Mensual
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 mt-6">
        
        {isDataLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-emerald-700">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p className="font-semibold text-sm">Sincronizando estado financiero global...</p>
          </div>
        ) : (
          <>
            {/* --- PESTAÑA: GASTOS E INGRESOS --- */}
            {activeTab === 'transacciones' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-800 mb-4 text-lg">Resumen de Flujo de Caja</h3>
                  
                  <div className="flex flex-col md:flex-row justify-between mb-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Ingresos Totales</p>
                      <p className="text-xl font-bold text-emerald-600">{formatQ(totalIncomes)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Gastos Totales</p>
                      <p className="text-xl font-bold text-red-500">{formatQ(totalExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Balance Restante</p>
                      <p className={`text-xl font-bold ${cashFlowBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatQ(cashFlowBalance)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Porcentaje gastado de ingresos</span>
                      <span>{spentPercentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          spentPercentage >= 100 ? 'bg-red-500' : 
                          spentPercentage >= 80 ? 'bg-orange-400' : 
                          'bg-emerald-500'
                        }`}
                        style={{ width: `${spentPercentage}%` }}
                      ></div>
                    </div>
                    {spentPercentage >= 100 && totalIncomes > 0 && (
                      <p className="text-xs text-red-500 mt-2 font-medium">¡Cuidado! Has gastado más o igual de lo que has ingresado.</p>
                    )}
                  </div>
                </div>

                {/* Formulario Transacciones */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-600" />
                    Nueva Transacción
                  </h2>
                  <form onSubmit={handleAddTx} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Tipo</label>
                      <select 
                        value={txForm.type} 
                        onChange={e => setTxForm({...txForm, type: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      >
                        <option value="ingreso">Ingreso (+)</option>
                        <option value="gasto">Gasto (-)</option>
                      </select>
                    </div>

                    <div className={txForm.type === 'gasto' ? "md:col-span-1" : "md:col-span-2"}>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Descripción</label>
                      <input type="text" required value={txForm.desc} onChange={e => setTxForm({...txForm, desc: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Ej. Súper, Gasolina, Pago de luz" />
                    </div>

                    {txForm.type === 'gasto' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Categoría Presupuesto</label>
                        <select 
                          value={txForm.category} 
                          onChange={e => setTxForm({...txForm, category: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                        >
                          {budgetCategories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                          ))}
                          <option value="Otros (No planificados)">Otros (No planificados)</option>
                          <option value="Abono de Deudas">Abono de Deudas</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Monto (Q)</label>
                      <input type="number" step="0.01" required value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="0.00" />
                    </div>

                    <div className="md:col-span-4 flex justify-end">
                      <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-medium transition-colors">
                        Guardar Transacción
                      </button>
                    </div>
                  </form>
                </div>

                {/* Lista Transacciones */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-700">Historial Reciente</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {transactions.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No hay transacciones registradas.</p>
                    ) : (
                      transactions.map(tx => (
                        <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${tx.type === 'ingreso' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                              {tx.type === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{tx.description}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{tx.date}</span>
                                {tx.type === 'gasto' && (
                                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                    {tx.category}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`font-semibold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {tx.type === 'ingreso' ? '+' : '-'}{formatQ(tx.amount)}
                            </span>
                            <button onClick={() => handleDeleteTx(tx.id)} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* --- PESTAÑA: DEUDAS --- */}
            {activeTab === 'deudas' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                
                {debts.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-md font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Scale className="w-5 h-5 text-indigo-500" />
                      Resumen General de Deudas
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <span className="block text-gray-400 text-xs">Total Original Acumulado</span>
                        <span className="text-xl font-bold text-gray-700">{formatQ(globalTotalDebtAmount)}</span>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-lg">
                        <span className="block text-emerald-600 text-xs">Total Pagado a la Fecha</span>
                        <span className="text-xl font-bold text-emerald-700">{formatQ(globalTotalPaid)}</span>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <span className="block text-red-600 text-xs">Saldo Pendiente Restante</span>
                        <span className="text-xl font-bold text-red-700">{formatQ(currentTotalDebt)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Avance de Pago Global</span>
                        <span>{globalDebtProgress.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-500" style={{ width: `${globalDebtProgress}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Formulario Agregar Deuda */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-600" />
                    Nueva Deuda
                  </h2>
                  <form onSubmit={handleAddDebt} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600 mb-1">Nombre (ej. Préstamo Bancario, Tarjeta)</label>
                      <input type="text" required value={debtForm.name} onChange={e => setDebtForm({...debtForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Descripción de la deuda" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Total (Q)</label>
                      <input type="number" step="0.01" required value={debtForm.total} onChange={e => setDebtForm({...debtForm, total: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Cuota Mensual (Q)</label>
                      <input type="number" step="0.01" required value={debtForm.monthly} onChange={e => setDebtForm({...debtForm, monthly: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="0.00" />
                    </div>
                    <div className="md:col-span-4 flex justify-end">
                      <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-medium transition-colors">
                        Agregar Deuda
                      </button>
                    </div>
                  </form>
                </div>

                {/* Lista de Deudas Individuales */}
                <div className="space-y-4">
                  {debts.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-gray-100">
                      <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No tienes deudas registradas. ¡Excelente!</p>
                    </div>
                  ) : (
                    debts.map(debt => {
                      const progress = Math.min(100, (debt.total_paid / debt.total_amount) * 100);
                      const isPaidOff = debt.balance === 0;

                      return (
                        <div key={debt.id} className={`p-5 rounded-xl shadow-sm border ${isPaidOff ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1 w-full">
                              <div className="flex justify-between items-center mb-1">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                  {debt.name}
                                  {isPaidOff && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                                </h3>
                                <button onClick={() => handleDeleteDebt(debt.id)} className="text-gray-400 hover:text-red-500">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-3">
                                <div className="bg-gray-50 p-2 rounded">
                                  <span className="block text-gray-500 text-xs">Total Original</span>
                                  <span className="font-medium text-gray-700">{formatQ(debt.total_amount)}</span>
                                </div>
                                <div className="bg-red-50 p-2 rounded">
                                  <span className="block text-red-500 text-xs">Saldo Pendiente</span>
                                  <span className="font-bold text-red-700">{formatQ(debt.balance)}</span>
                                </div>
                                <div className="bg-emerald-50 p-2 rounded">
                                  <span className="block text-emerald-600 text-xs">Total Pagado</span>
                                  <span className="font-medium text-emerald-700">{formatQ(debt.total_paid)}</span>
                                </div>
                                <div className="bg-blue-50 p-2 rounded">
                                  <span className="block text-blue-500 text-xs">Cuota Mensual</span>
                                  <span className="font-medium text-blue-700">{formatQ(debt.monthly_payment)}</span>
                                </div>
                              </div>

                              {/* Barra de progreso */}
                              <div className="mt-4">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                  <span>Progreso del pago</span>
                                  <span>{progress.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                  <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                </div>
                              </div>
                            </div>

                            {/* Área de Pago */}
                            {!isPaidOff && (
                              <div className="w-full md:w-auto bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col gap-2">
                                <label className="text-xs font-medium text-gray-600">Registrar Pago (Q)</label>
                                <div className="flex gap-2">
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    className="w-full md:w-28 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                    placeholder={debt.monthly_payment.toString()}
                                    value={paymentInputs[debt.id] || ''}
                                    onChange={(e) => setPaymentInputs({...paymentInputs, [debt.id]: e.target.value})}
                                  />
                                  <button 
                                    onClick={() => handlePayDebt(debt.id)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                                  >
                                    Abonar
                                  </button>
                                </div>
                                <button 
                                  onClick={() => {
                                    setPaymentInputs({...paymentInputs, [debt.id]: debt.monthly_payment});
                                  }}
                                  className="text-xs text-blue-600 hover:underline text-left mt-1"
                                >
                                  Llenar con cuota mensual
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* HISTORIAL CRÓNICO DE ABONOS A DEUDAS */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-gray-700">Historial Cronológico de Abonos realizados</h3>
                  </div>
                  <div className="p-4">
                    {paymentHistory.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-6">Aún no has registrado abonos a tus deudas en la nube.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-400 font-medium">
                              <th className="py-2">Deuda</th>
                              <th className="py-2">Monto Abonado</th>
                              <th className="py-2">Fecha de Abono</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {paymentHistory.map((pay) => (
                              <tr key={pay.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="py-3 font-semibold text-gray-800">{pay.debt_name}</td>
                                <td className="py-3 font-bold text-emerald-600">{formatQ(pay.amount_paid)}</td>
                                <td className="py-3 text-gray-500">{new Date(pay.payment_date).toLocaleDateString('es-GT', { timeZone: 'UTC' })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* --- PESTAÑA: PRESUPUESTO --- */}
            {activeTab === 'presupuesto' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                      <PieChart className="w-5 h-5 text-emerald-600" />
                      Mi Presupuesto Total Mensual
                    </h3>
                    <p className="text-sm text-gray-500">Establece la cantidad total de dinero que quieres distribuir este mes.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Monto de Presupuesto Mensual (Q)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="w-full px-4 py-2.5 text-lg font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-gray-50"
                      value={monthlyBudget}
                      onChange={e => handleBudgetChange(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Formulario Agregar Categorías de Presupuesto */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-600" />
                    Planificar Nueva Categoría de Gasto
                  </h2>
                  <form onSubmit={handleAddCategory} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Nombre de la Categoría</label>
                      <input 
                        type="text" 
                        required 
                        value={categoryForm.name} 
                        onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                        placeholder="Ej. Alimentación, Gasolina, Alquiler" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Gasto Aproximado (Q)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        required 
                        value={categoryForm.estimate} 
                        onChange={e => setCategoryForm({...categoryForm, estimate: e.target.value})} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                        placeholder="0.00" 
                      />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
                        Añadir Categoría
                      </button>
                    </div>
                  </form>
                </div>

                {/* Resumen de Asignación y Planificación de Gastos */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100 shadow-sm">
                    <span className="block text-emerald-700 text-xs font-semibold uppercase tracking-wider">Mi Presupuesto</span>
                    <span className="text-2xl font-bold text-emerald-900 mt-1 block">{formatQ(monthlyBudget)}</span>
                  </div>
                  <div className="bg-orange-50 p-5 rounded-xl border border-orange-100 shadow-sm">
                    <span className="block text-orange-700 text-xs font-semibold uppercase tracking-wider">Gastos Aproximados</span>
                    <span className="text-2xl font-bold text-orange-950 mt-1 block">{formatQ(totalEstimatedExpenses)}</span>
                  </div>
                  <div className={`p-5 rounded-xl border shadow-sm ${remainingBudget >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                    <span className={`block text-xs font-semibold uppercase tracking-wider ${remainingBudget >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {remainingBudget >= 0 ? 'Monto Disponible' : 'Superado por'}
                    </span>
                    <span className={`text-2xl font-bold mt-1 block ${remainingBudget >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
                      {formatQ(Math.abs(remainingBudget))}
                    </span>
                  </div>
                </div>

                {/* Barra de progreso visual de Asignación */}
                {monthlyBudget > 0 && (
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                      <span>Asignación del Presupuesto</span>
                      <span>{((totalEstimatedExpenses / monthlyBudget) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          totalEstimatedExpenses > monthlyBudget ? 'bg-red-500' : 'bg-emerald-500'
                        }`} 
                        style={{ width: `${Math.min(100, (totalEstimatedExpenses / monthlyBudget) * 100)}%` }}
                      ></div>
                    </div>
                    {totalEstimatedExpenses > monthlyBudget && (
                      <p className="text-xs text-red-500 mt-2 font-medium">
                        ⚠️ Tus gastos aproximados planeados superan tu presupuesto definido. Te has pasado por {formatQ(Math.abs(remainingBudget))}.
                      </p>
                    )}
                  </div>
                )}

                {/* Lista Interactiva de Categorías de Gasto Estimadas */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-700">Distribución de Gastos Aproximados</h3>
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-medium px-2.5 py-0.5 rounded-full">
                      {budgetCategories.length} Categorías
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {budgetCategories.length === 0 ? (
                      <p className="text-center text-gray-500 py-10 px-4">
                        No has agregado categorías. Usa el formulario de arriba para definir tus gastos mensuales aproximados.
                      </p>
                    ) : (
                      budgetCategories.map(cat => {
                        const percentage = monthlyBudget > 0 ? ((cat.estimate / monthlyBudget) * 100) : 0;
                        return (
                          <div key={cat.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50/50 transition-colors">
                            <div className="flex-1 w-full">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-gray-800">{cat.name}</span>
                                <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                  {formatQ(cat.estimate)}
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, percentage)}%` }}></div>
                              </div>
                              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                <span>Gasto planificado</span>
                                <span>{percentage.toFixed(1)}% de tu presupuesto</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleDeleteCategory(cat.id)} 
                              className="text-gray-400 hover:text-red-500 self-end sm:self-center p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* --- PESTAÑA: COMPARACIÓN Y MATCH --- */}
            {activeTab === 'comparacion' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                
                {/* Tarjeta de Score General de Match */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                        Tu Score de Cumplimiento Financiero
                      </h3>
                      <p className="text-sm text-gray-500 max-w-md">
                        Este indicador evalúa cuántas de tus categorías planificadas se mantuvieron dentro de tus límites de gasto aproximados. Un 100% significa que todos tus gastos reales fueron inferiores o iguales a tu planificación.
                      </p>
                    </div>
                    
                    <div className="relative flex items-center justify-center">
                      <div className="w-28 h-28 rounded-full border-8 border-gray-100 flex items-center justify-center relative bg-indigo-50/50">
                        <span className="text-2xl font-extrabold text-indigo-700">{complianceScore}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comparativa General Simplificada */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Presupuesto Estimado General</h4>
                    <p className="text-3xl font-bold text-gray-800">{formatQ(totalEstimatedExpenses)}</p>
                    <p className="text-xs text-gray-500 mt-1">Límite de gastos aproximado que planificaste.</p>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Gasto Real Total</h4>
                    <p className={`text-3xl font-bold ${totalExpenses > totalEstimatedExpenses ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatQ(totalExpenses)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Suma de todos tus egresos reales registrados.</p>
                  </div>
                </div>

                {/* Desglose Comparativo de Categorías */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-700">Análisis Planificado vs. Real por Categoría</h3>
                  </div>
                  <div className="p-4 space-y-6">
                    
                    {budgetCategories.length === 0 ? (
                      <p className="text-center text-gray-500 py-6">
                        Aún no has agregado categorías en la pestaña "Presupuesto". Configúralas para ver la comparación inteligente.
                      </p>
                    ) : (
                      budgetCategories.map(cat => {
                        const realSpent = getRealSpentByCategory(cat.name);
                        const isOverBudget = realSpent > cat.estimate;
                        const percent = cat.estimate > 0 ? (realSpent / cat.estimate) * 100 : 0;
                        
                        let statusLabel = "¡Logrado (Ahorro)! 🎉";
                        let statusClass = "text-emerald-700 bg-emerald-100";
                        
                        if (realSpent === 0) {
                          statusLabel = "Sin gastos registrados aún";
                          statusClass = "text-gray-500 bg-gray-100";
                        } else if (realSpent === cat.estimate) {
                          statusLabel = "¡En el límite exacto! ⚠️";
                          statusClass = "text-orange-700 bg-orange-100";
                        } else if (isOverBudget) {
                          statusLabel = `Superado por ${formatQ(realSpent - cat.estimate)} 🚨`;
                          statusClass = "text-red-700 bg-red-100";
                        }

                        return (
                          <div key={cat.id} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
                            <div className="flex justify-between items-center mb-2">
                              <div>
                                <span className="font-bold text-gray-800 text-sm">{cat.name}</span>
                                <span className={`ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 text-right">
                                <span className="block font-medium text-gray-800">
                                  Real: {formatQ(realSpent)}
                                </span>
                                <span className="block text-[10px]">
                                  Planificado: {formatQ(cat.estimate)}
                                </span>
                              </div>
                            </div>

                            {/* Comparación visual */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-gray-400 w-10">Plan:</span>
                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                  <div className="bg-gray-400 h-full rounded-full" style={{ width: '100%' }}></div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-gray-400 w-10">Real:</span>
                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      isOverBudget ? 'bg-red-500' : 'bg-emerald-500'
                                    }`} 
                                    style={{ width: `${Math.min(100, percent)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Gastos No planificados */}
                    {nonPlannedSpent > 0 && (
                      <div className="border-t border-dashed border-gray-200 pt-4">
                        <div className="flex justify-between items-center mb-2">
                          <div>
                            <span className="font-bold text-gray-700 text-sm">Otros (No planificados)</span>
                            <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full text-red-700 bg-red-100">
                              Gastado fuera de plan 🚨
                            </span>
                          </div>
                          <span className="font-semibold text-sm text-gray-700">{formatQ(nonPlannedSpent)}</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          Son gastos que registraste que no corresponden a ninguna categoría que planificaste en tu pestaña de presupuestos.
                        </p>
                      </div>
                    )}

                  </div>
                </div>

              </div>
            )}

            {/* --- PESTAÑA: HISTORIAL MENSUAL --- */}
            {activeTab === 'historico' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                
                {/* Tarjeta de Resumen de Evolución */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-600" />
                    Resumen de Evolución Financiera
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                      <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider block">Reducción de Deuda</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-extrabold text-indigo-900">
                          {debtReductionPercent > 0 ? `-${debtReductionPercent.toFixed(1)}%` : '0.0%'}
                        </span>
                        <span className="text-xs text-indigo-600 font-medium">desde Marzo 2026</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Has logrado disminuir tu saldo pendiente acumulado en un total de {formatQ(Math.max(0, initialDebt - currentTotalDebt))}.
                      </p>
                    </div>

                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                      <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">Capacidad de Ahorro Real</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className={`text-2xl font-extrabold ${cashFlowBalance >= 0 ? 'text-emerald-900' : 'text-red-950'}`}>
                          {formatQ(cashFlowBalance)}
                        </span>
                        <span className="text-xs text-emerald-600 font-medium">este mes</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {cashFlowBalance >= 0 
                          ? '¡Felicidades! Mantienes un flujo de caja saludable con saldo disponible positivo.' 
                          : 'Estás gastando más de lo que ingresas este mes. Revisa tus prioridades de gasto.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Gráfico Comparativo Mes a Mes */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h4 className="font-bold text-gray-800">Evolución de Ingresos, Gastos y Deudas</h4>
                      <p className="text-xs text-gray-400">Comparación rápida de balances para verificar tu progreso general</p>
                    </div>
                    {/* Leyendas */}
                    <div className="hidden sm:flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-emerald-500 rounded"></span>
                        <span className="text-gray-600">Ingresos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-red-500 rounded"></span>
                        <span className="text-gray-600">Gastos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-amber-500 rounded"></span>
                        <span className="text-gray-600">Deudas</span>
                      </div>
                    </div>
                  </div>

                  {/* Lista de de Barras de Meses */}
                  <div className="space-y-8">
                    {allMonthsHistory.map((m, index) => {
                      const percentIngresos = (m.ingresos / maxHistoricalValue) * 100;
                      const percentGastos = (m.gastos / maxHistoricalValue) * 100;
                      const percentDeudas = (m.deudas / maxHistoricalValue) * 100;

                      return (
                        <div key={index} className="border-b border-gray-100 last:border-b-0 pb-6 last:pb-0">
                          {/* Cabecera del Mes */}
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-extrabold text-gray-700 text-sm sm:text-base">
                              {m.month}
                            </span>
                            <div className="flex gap-3 text-[10px] sm:text-xs text-gray-500">
                              <span>Ingreso: <strong className="text-emerald-600">{formatQ(m.ingresos)}</strong></span>
                              <span>Gasto: <strong className="text-red-500">{formatQ(m.gastos)}</strong></span>
                              <span>Deuda: <strong className="text-amber-600">{formatQ(m.deudas)}</strong></span>
                            </div>
                          </div>

                      {/* Gráfico de barras horizontales */}
                      <div className="space-y-2">
                        {/* Fila de Ingreso */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-semibold text-gray-400 w-12 text-right">ING</span>
                          <div className="flex-1 bg-gray-100 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${percentIngresos}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Fila de Gasto */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-semibold text-gray-400 w-12 text-right">GAS</span>
                          <div className="flex-1 bg-gray-100 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-red-500 h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${percentGastos}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Fila de Deuda */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-semibold text-gray-400 w-12 text-right">DEU</span>
                          <div className="flex-1 bg-gray-100 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-amber-500 h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${percentDeudas}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leyendas para pantallas móviles */}
              <div className="flex sm:hidden justify-center items-center gap-4 text-[10px] text-gray-500 border-t border-gray-100 pt-4 mt-6">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded"></span>
                  <span>Ingresos (ING)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded"></span>
                  <span>Gastos (GAS)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded"></span>
                  <span>Deudas (DEU)</span>
                </div>
              </div>
            </div>

          </div>
        )}
      </>
    )}

      </main>
    </div>
  );
}
