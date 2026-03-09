import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wallet, Send, Landmark, History, LogOut, ArrowRight, ArrowLeft, Users, PlusCircle } from 'lucide-react';

// --- Types ---
interface Player {
  name: string;
  balance: number;
  joinedAt: string;
}

interface LogEntry {
  id: string;
  from: string;
  to: string;
  amount: number;
  type: string;
  timestamp: string;
}

interface GameState {
  code: string;
  createdAt: string;
  players: Record<string, Player>;
  logs: LogEntry[];
}

// --- Utils ---
const getUserId = () => {
  let uid = localStorage.getItem('monopoly_uid');
  if (!uid) {
    uid = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('monopoly_uid', uid);
  }
  return uid;
};

export default function App() {
  const [uid] = useState(getUserId());
  const [playerName, setPlayerName] = useState(localStorage.getItem('monopoly_name') || '');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<'wallet' | 'players' | 'history'>('wallet');
  const [transferModal, setTransferModal] = useState<{ isOpen: boolean; targetUid: string | null; targetName: string }>({
    isOpen: false,
    targetUid: null,
    targetName: '',
  });
  const [transferAmount, setTransferAmount] = useState('');

  const socketRef = useRef<WebSocket | null>(null);

  // --- WebSocket Connection ---
  const connectToRoom = useCallback((code: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', roomCode: code, uid }));
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'sync') {
        setGameState(message.state);
        setLoading(false);
      }
    };

    socket.onclose = () => {
      console.log('Socket closed');
    };

    return () => socket.close();
  }, [uid]);

  useEffect(() => {
    if (roomCode) {
      const cleanup = connectToRoom(roomCode);
      return cleanup;
    }
  }, [roomCode, connectToRoom]);

  // --- Actions ---
  const sendAction = (newState: GameState) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'action', roomCode, newState }));
    }
  };

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      setError('אנא הכנס את שמך');
      return;
    }
    localStorage.setItem('monopoly_name', playerName);
    setError('');
    setLoading(true);

    const newCode = generateRoomCode();
    const initialData: GameState = {
      code: newCode,
      createdAt: new Date().toISOString(),
      players: {
        [uid]: {
          name: playerName,
          balance: 1500,
          joinedAt: new Date().toISOString(),
        },
      },
      logs: [
        {
          id: Date.now().toString(),
          from: 'bank',
          to: uid,
          amount: 1500,
          type: 'initial',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // We need to establish connection first to send action, 
    // but the server handles "join" by sending existing state.
    // For creation, we'll just set the room code and the server will handle it.
    // Actually, let's just send the action once connected.
    setRoomCode(newCode);
    // The server will send null state if it doesn't exist.
    // We'll handle the first sync in the socket message handler.
    // Wait, let's simplify: send action to server to create.
    // In our server.ts, "action" replaces state.
    // So we just need to wait for the socket to open.
    const interval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'action', roomCode: newCode, newState: initialData }));
        clearInterval(interval);
      }
    }, 100);
  };

  const handleJoinGame = () => {
    if (!playerName.trim()) {
      setError('אנא הכנס את שמך');
      return;
    }
    if (!inputCode.trim()) {
      setError('אנא הכנס קוד חדר');
      return;
    }
    localStorage.setItem('monopoly_name', playerName);
    setError('');
    setLoading(true);

    const code = inputCode.trim().toUpperCase();
    setRoomCode(code);
    
    // Once connected, we'll get the state. If we aren't in players, we add ourselves.
    // This logic will be in a useEffect that watches gameState.
  };

  useEffect(() => {
    if (gameState && !gameState.players[uid] && roomCode) {
      const updatedState = {
        ...gameState,
        players: {
          ...gameState.players,
          [uid]: {
            name: playerName,
            balance: 1500,
            joinedAt: new Date().toISOString(),
          },
        },
        logs: [
          ...gameState.logs,
          {
            id: Date.now().toString(),
            from: 'bank',
            to: uid,
            amount: 1500,
            type: 'initial',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      sendAction(updatedState);
    }
  }, [gameState, uid, playerName, roomCode]);

  const leaveGame = () => {
    setRoomCode('');
    setGameState(null);
    setInputCode('');
    setActiveTab('wallet');
    if (socketRef.current) socketRef.current.close();
  };

  const handleTransfer = (toUid: string, amountNum: number, type = 'transfer') => {
    if (!amountNum || amountNum <= 0 || !gameState) return;
    
    const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
    const fromUid = uid;

    if (fromUid !== 'bank') {
      if (newState.players[fromUid].balance < amountNum) {
        setError('אין מספיק כסף בקופה!');
        return;
      }
      newState.players[fromUid].balance -= amountNum;
    }
    
    if (toUid !== 'bank') {
      newState.players[toUid].balance += amountNum;
    }

    newState.logs.push({
      id: Date.now().toString() + Math.random().toString(16).slice(2),
      from: fromUid,
      to: toUid,
      amount: amountNum,
      type: type,
      timestamp: new Date().toISOString(),
    });

    sendAction(newState);
    setTransferModal({ isOpen: false, targetUid: null, targetName: '' });
    setTransferAmount('');
  };

  const handleBankTransfer = (action: 'pay_bank' | 'receive_bank', amountNum: number) => {
    if (!amountNum || amountNum <= 0 || !gameState) return;
    
    const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
    
    if (action === 'pay_bank') {
      if (newState.players[uid].balance < amountNum) {
        setError('אין מספיק כסף בקופה!');
        return;
      }
      newState.players[uid].balance -= amountNum;
      newState.logs.push({
        id: Date.now().toString(),
        from: uid,
        to: 'bank',
        amount: amountNum,
        type: 'pay_bank',
        timestamp: new Date().toISOString(),
      });
    } else if (action === 'receive_bank') {
      newState.players[uid].balance += amountNum;
      newState.logs.push({
        id: Date.now().toString(),
        from: 'bank',
        to: uid,
        amount: amountNum,
        type: 'receive_bank',
        timestamp: new Date().toISOString(),
      });
    }

    sendAction(newState);
    setTransferAmount('');
  };

  // --- Render Helpers ---
  if (loading && !gameState) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-50 text-green-800 text-xl font-bold font-sans" dir="rtl">
        טוען...
      </div>
    );
  }

  // --- Screen: Home / Login ---
  if (!roomCode || !gameState) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 border-t-8 border-green-600">
          <div className="text-center mb-8">
            <Landmark className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h1 className="text-3xl font-black text-gray-800 tracking-tight">בנק מונופול</h1>
            <p className="text-gray-500 mt-2">הארנק הדיגיטלי למשחק שלכם</p>
          </div>

          {error && <div className="bg-red-100 text-red-700 p-3 rounded-xl mb-6 text-sm text-center font-medium">{error}</div>}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">איך קוראים לך?</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="הכנס את שמך"
                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500 focus:bg-white transition-colors"
              />
            </div>

            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={handleCreateGame}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-md transition-transform active:scale-95 flex justify-center items-center gap-2 mb-4"
              >
                <PlusCircle className="w-5 h-5" />
                צור משחק חדש
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink-0 mx-4 text-gray-400 text-sm font-medium">או הצטרף לקיים</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              <div className="flex gap-2 mt-4">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder="קוד חדר"
                  className="flex-1 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-500 text-center uppercase font-bold tracking-widest"
                  maxLength={4}
                />
                <button
                  onClick={handleJoinGame}
                  disabled={loading}
                  className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-6 py-3 rounded-xl transition-transform active:scale-95"
                >
                  הצטרף
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Screen: Game Dashboard ---
  const myPlayer = gameState.players[uid];
  const otherPlayers = Object.entries(gameState.players).filter(([pUid]) => pUid !== uid) as [string, Player][];
  
  if (!myPlayer) return <div dir="rtl" className="p-8 text-center">טוען נתוני שחקן...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-24" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-green-100 p-2 rounded-lg">
              <Landmark className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 leading-none">בנק מונופול</h1>
              <span className="text-xs text-gray-500 font-mono tracking-widest block mt-1">חדר: {roomCode}</span>
            </div>
          </div>
          <button onClick={leaveGame} className="text-gray-400 hover:text-red-500 transition-colors p-2">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        
        {/* Main Balance Card */}
        {activeTab === 'wallet' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-3xl p-6 text-white shadow-lg shadow-green-900/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Landmark className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <p className="text-green-100 font-medium mb-1">היתרה שלך, {myPlayer.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tight">{myPlayer.balance.toLocaleString()}</span>
                  <span className="text-xl font-bold text-green-200">₪</span>
                </div>
              </div>
            </div>

            {/* Quick Bank Actions */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => handleBankTransfer('receive_bank', 200)}
                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:border-green-300 transition-all active:scale-95"
              >
                <div className="bg-green-100 text-green-600 p-3 rounded-full">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <span className="font-bold text-gray-700 text-sm">עבור בדרך צלחה</span>
                <span className="text-green-600 font-black">+200₪</span>
              </button>

              <button 
                onClick={() => setTransferModal({ isOpen: true, targetUid: 'bank', targetName: 'הבנק' })}
                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:border-red-300 transition-all active:scale-95"
              >
                <div className="bg-red-50 text-red-500 p-3 rounded-full">
                  <Landmark className="w-6 h-6" />
                </div>
                <span className="font-bold text-gray-700 text-sm">תשלום לבנק</span>
                <span className="text-gray-400 text-xs">קנייה / קנס</span>
              </button>
            </div>

            {/* Quick Players Transfer */}
            <div>
              <h3 className="font-bold text-gray-800 mb-3 px-1">העבר לשחקן</h3>
              <div className="space-y-3">
                {otherPlayers.length === 0 ? (
                  <div className="text-center p-6 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                    עדיין אין שחקנים נוספים בחדר.<br/> תן להם את הקוד: <strong className="text-gray-600">{roomCode}</strong>
                  </div>
                ) : (
                  otherPlayers.map(([pUid, player]) => (
                    <div key={pUid} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 text-gray-600 w-10 h-10 rounded-full flex items-center justify-center font-bold">
                          {player.name.charAt(0)}
                        </div>
                        <span className="font-bold text-gray-800">{player.name}</span>
                      </div>
                      <button 
                        onClick={() => setTransferModal({ isOpen: true, targetUid: pUid, targetName: player.name })}
                        className="bg-gray-50 hover:bg-green-50 hover:text-green-600 text-gray-600 px-4 py-2 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        העבר
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Players Tab */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            <h2 className="font-black text-2xl text-gray-800 mb-6">מצב השחקנים</h2>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 bg-green-50 border-b border-green-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-green-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold">
                    {myPlayer.name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-gray-800 block">{myPlayer.name} (את/ה)</span>
                  </div>
                </div>
                <span className="font-black text-green-700 text-lg">{myPlayer.balance.toLocaleString()} ₪</span>
              </div>
              
              <div className="divide-y divide-gray-50">
                {otherPlayers.map(([pUid, player]) => (
                  <div key={pUid} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-100 text-gray-600 w-10 h-10 rounded-full flex items-center justify-center font-bold">
                        {player.name.charAt(0)}
                      </div>
                      <span className="font-bold text-gray-700">{player.name}</span>
                    </div>
                    <span className="font-bold text-gray-600">{player.balance.toLocaleString()} ₪</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="font-black text-2xl text-gray-800 mb-6">היסטוריית פעולות</h2>
            <div className="space-y-3">
              {[...gameState.logs].reverse().map(log => {
                const isFromMe = log.from === uid;
                const isToMe = log.to === uid;
                
                const fromName = log.from === 'bank' ? 'הבנק' : (gameState.players[log.from]?.name || 'שחקן לא ידוע');
                const toName = log.to === 'bank' ? 'הבנק' : (gameState.players[log.to]?.name || 'שחקן לא ידוע');

                let icon = <ArrowRight className="w-5 h-5 text-gray-400" />;
                let amountPrefix = "";

                if (isFromMe) {
                  icon = <ArrowLeft className="w-5 h-5 text-red-500" />;
                  amountPrefix = "-";
                } else if (isToMe) {
                  icon = <ArrowRight className="w-5 h-5 text-green-500" />;
                  amountPrefix = "+";
                }

                return (
                  <div key={log.id} className="p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-50 p-2 rounded-full">
                        {icon}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">
                          {isFromMe ? `העברת ל${toName}` : (isToMe ? `קיבלת מ${fromName}` : `${fromName} העביר ל${toName}`)}
                        </p>
                        <span className="text-xs text-gray-400">
                          {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    </div>
                    <span className={`font-black ${isFromMe ? 'text-gray-800' : (isToMe ? 'text-green-600' : 'text-gray-400')}`}>
                      {amountPrefix}{log.amount.toLocaleString()} ₪
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
        <div className="max-w-md mx-auto flex justify-around">
          <button 
            onClick={() => setActiveTab('wallet')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === 'wallet' ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Wallet className="w-6 h-6" />
            <span className="text-xs font-bold">ארנק</span>
          </button>
          <button 
            onClick={() => setActiveTab('players')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === 'players' ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Users className="w-6 h-6" />
            <span className="text-xs font-bold">שחקנים</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === 'history' ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <History className="w-6 h-6" />
            <span className="text-xs font-bold">היסטוריה</span>
          </button>
        </div>
      </nav>

      {/* Transfer Modal */}
      {transferModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-xl font-black text-gray-800 mb-1 text-center">העברת כספים</h3>
            <p className="text-center text-gray-500 text-sm mb-6">
              מיועד ל: <strong className="text-gray-800">{transferModal.targetName}</strong>
            </p>

            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2 text-center">סכום (₪)</label>
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-4 focus:outline-none focus:border-green-500 text-center text-3xl font-black text-gray-800"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setTransferModal({ isOpen: false, targetUid: null, targetName: '' });
                  setTransferAmount('');
                }}
                className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  if (transferModal.targetUid === 'bank') {
                    handleBankTransfer('pay_bank', parseInt(transferAmount));
                    setTransferModal({ isOpen: false, targetUid: null, targetName: '' });
                  } else if (transferModal.targetUid) {
                    handleTransfer(transferModal.targetUid, parseInt(transferAmount));
                  }
                }}
                disabled={loading || !transferAmount || parseInt(transferAmount) <= 0}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors shadow-md shadow-green-600/20"
              >
                {loading ? 'מבצע...' : 'אשר העברה'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
      `}} />
    </div>
  );
}
