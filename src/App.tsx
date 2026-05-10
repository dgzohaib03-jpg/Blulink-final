/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { motion, AnimatePresence } from 'motion/react';
import { Bluetooth, BluetoothOff, Send, User, ChevronLeft, QrCode, Scan, Copy, Check, Info, FileText, Download, Paperclip, Phone, PhoneOff, Mic, MicOff, UserPlus, Trash2, Users, Clock, StopCircle, Activity, MessageSquare, Search, MoreVertical, Smile, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Message, PeerData, Contact, CallRecord } from './types';
import { 
  generateKeyPair, 
  exportPublicKey, 
  importPublicKey, 
  deriveSecretKey, 
  encryptData, 
  decryptData,
  arrayBufferToBase64,
  base64ToArrayBuffer
} from './lib/crypto';

export default function App() {
  const [userName, setUserName] = useState<string>(() => {
    const saved = localStorage.getItem('bluelink_name');
    if (saved) return saved;
    return `Node-${Math.floor(Math.random() * 9000) + 1000}`;
  });
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [remoteId, setRemoteId] = useState<string>('');
  const [remoteName, setRemoteName] = useState<string>('');
  const [step, setStep] = useState<'discovery' | 'chat' | 'account' | 'calls' | 'contacts'>('discovery');
  const [isTyping, setIsTyping] = useState(false);
  const [showId, setShowId] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  
  const [localKeyPair, setLocalKeyPair] = useState<CryptoKeyPair | null>(null);
  const [sharedSecret, setSharedSecret] = useState<CryptoKey | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('bluelink_contacts');
    return saved ? JSON.parse(saved) : [];
  });
  const contactsRef = useRef<Contact[]>(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
    localStorage.setItem('bluelink_contacts', JSON.stringify(contacts));
  }, [contacts]);

  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [potentialContact, setPotentialContact] = useState<Contact | null>(null);
  const [queuedMessages, setQueuedMessages] = useState<Record<string, Message[]>>(() => {
    const saved = localStorage.getItem('bluelink_queue');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [activeCall, setActiveCall] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'active'>('idle');
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callHistory, setCallHistory] = useState<CallRecord[]>(() => {
    const saved = localStorage.getItem('bluelink_calls');
    return saved ? JSON.parse(saved) : [];
  });
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const [unreadCount, setUnreadCount] = useState(0);
  const [isTabActive, setIsTabActive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'mesh' | 'id'>('mesh');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Handle Tab Visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      const active = document.visibilityState === 'visible';
      setIsTabActive(active);
      if (active) {
        setUnreadCount(0);
        document.title = 'BlueLink P2P | Secure Local Chat';
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Update Title with Unread Count
  useEffect(() => {
    if (!isTabActive && unreadCount > 0) {
      document.title = `(${unreadCount}) BlueLink P2P | New Messages`;
    }
  }, [unreadCount, isTabActive]);

  // Request Notification Permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  useEffect(() => {
    if (step !== 'onboarding') {
      requestNotificationPermission();
    }
  }, [step]);

  useEffect(() => {
    const initCrypto = async () => {
      try {
        const keys = await generateKeyPair();
        setLocalKeyPair(keys);
      } catch (e) {
        console.error('Failed to initialize crypto', e);
      }
    };
    initCrypto();
  }, []);

  // Initialize PeerJS
  useEffect(() => {
    if (userName && step !== 'onboarding') {
      const newPeer = new Peer();
      
      newPeer.on('open', (id) => {
        setPeerId(id);
        console.log('My peer ID is: ' + id);
      });

      newPeer.on('connection', (conn) => {
        // Handle incoming connection
        if (connection) {
          conn.close(); // Only one connection for now
          return;
        }
        
        setupConnection(conn);
      });

      newPeer.on('call', (call) => {
        setCallStatus('ringing');
        setIsIncomingCall(true);
        setActiveCall(call);
      });

      newPeer.on('error', (err) => {
        console.error('Peer error:', err);
        alert('Connection error. Please check your network.');
      });

      setPeer(newPeer);
      return () => {
        newPeer.destroy();
      };
    }
  }, [userName, step === 'onboarding']);

  // Handle incoming data
  const setupConnection = useCallback((conn: DataConnection) => {
    const sendKeyExchange = async () => {
      if (localKeyPair) {
        const exportedPubKey = await exportPublicKey(localKeyPair.publicKey);
        conn.send({ type: 'key-exchange', payload: { publicKey: exportedPubKey } });
      }
    };

    conn.on('open', () => {
      setConnection(conn);
      setConnectionStatus('connected');
      setRemoteId(conn.peer);
      // Wait for name exchange
      conn.send({ type: 'system', payload: { name: userName } });
      setStep('chat');
      
      // Start key exchange
      sendKeyExchange();

      // Send queued messages for this peer
      const queue = queuedMessages[conn.peer] || [];
      if (queue.length > 0) {
        queue.forEach(msg => {
          conn.send({ type: 'chat', payload: { ...msg, status: 'sent' } });
        });
        setMessages(prev => prev.map(m => {
          const queued = queue.find(q => q.id === m.id);
          return queued ? { ...m, status: 'sent' } : m;
        }));
        setQueuedMessages(prev => {
          const next = { ...prev };
          delete next[conn.peer];
          return next;
        });
      }
    });

    conn.on('data', async (data: any) => {
      const peerData = data as PeerData;
      
      if (peerData.type === 'key-exchange') {
        const remotePubKeyData = peerData.payload.publicKey;
        if (localKeyPair && remotePubKeyData) {
          try {
            const remotePubKey = await importPublicKey(remotePubKeyData);
            const secret = await deriveSecretKey(localKeyPair.privateKey, remotePubKey);
            setSharedSecret(secret);
            setIsEncrypted(true);
            
            // If we received their key but haven't derived ours yet in their view, 
            // ensure we've sent ours (setupConnection handles initial send, but this is double check)
            if (!peerData.payload.isResponse) {
              const exportedPubKey = await exportPublicKey(localKeyPair.publicKey);
              conn.send({ type: 'key-exchange', payload: { publicKey: exportedPubKey, isResponse: true } });
            }
          } catch (e) {
            console.error('Key derivation failed', e);
          }
        }
      } else if (peerData.type === 'chat') {
        let msg = peerData.payload as any;
        
        // Decrypt if encrypted
        if (msg.encrypted && sharedSecret) {
          try {
            if (msg.textIv && msg.encryptedText) {
              const iv = base64ToArrayBuffer(msg.textIv);
              const encryptedData = base64ToArrayBuffer(msg.encryptedText);
              const decryptedBuffer = await decryptData(encryptedData, sharedSecret, new Uint8Array(iv));
              msg.text = new TextDecoder().decode(decryptedBuffer);
            }
            
            if (msg.file && msg.file.encryptedData && msg.file.iv) {
              const iv = base64ToArrayBuffer(msg.file.iv);
              const encryptedData = base64ToArrayBuffer(msg.file.encryptedData);
              const decryptedBuffer = await decryptData(encryptedData, sharedSecret, new Uint8Array(iv));
              msg.file.data = decryptedBuffer;
            }
          } catch (e) {
            console.error('Decryption failed', e);
            msg.text = '[DECRYPTION FAILED]';
          }
        }

        // Handle incoming file data
        if (msg.file && msg.file.data) {
          try {
            const blob = new Blob([msg.file.data as ArrayBuffer], { type: msg.file.type });
            msg.file.url = URL.createObjectURL(blob);
          } catch (e) {
            console.error('Failed to create blob for incoming file:', e);
          }
        }
        
        setMessages((prev) => [...prev, { ...msg, isMe: false, status: 'read' }]);
        
        // Trigger notification if tab is backgrounded
        if (document.visibilityState !== 'visible') {
          setUnreadCount(prev => prev + 1);
          if (Notification.permission === 'granted') {
            new Notification(`Message from ${msg.senderName}`, {
              body: msg.text || (msg.file ? `Shared a file: ${msg.file.name}` : 'New message'),
              icon: '/favicon.ico'
            });
          }
        }

        // Send read receipt back
        conn.send({ type: 'receipt', payload: { messageId: msg.id, status: 'read' } });
      } else if (peerData.type === 'receipt') {
        const { messageId, status } = peerData.payload;
        setMessages((prev) => 
          prev.map(m => m.id === messageId ? { ...m, status } : m)
        );
      } else if (peerData.type === 'system') {
        if (peerData.payload.name) {
          setRemoteName(peerData.payload.name);
          
          // Auto-prompt to save contact if unknown
          const isKnown = contactsRef.current.some(c => c.id === conn.peer);
          if (!isKnown && !showSavePrompt) {
            setPotentialContact({
              id: conn.peer,
              name: peerData.payload.name || `Node-${conn.peer.substring(0, 4)}`,
              addedAt: Date.now()
            });
            setShowSavePrompt(true);
          }
        }
      } else if (peerData.type === 'typing') {
        setIsTyping(peerData.payload.isTyping);
      }
    });

    conn.on('close', () => {
      setConnection(null);
      setConnectionStatus('disconnected');
      setIsEncrypted(false);
      setSharedSecret(null);
      setStep('discovery');
      alert('Peer disconnected');
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      setConnectionStatus('disconnected');
    });
  }, [userName]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (callStatus === 'active') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStatus]);

  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    localStorage.setItem('bluelink_contacts', JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem('bluelink_queue', JSON.stringify(queuedMessages));
  }, [queuedMessages]);

  useEffect(() => {
    if (userName && !localStorage.getItem('bluelink_name')) {
      localStorage.setItem('bluelink_name', userName);
    }
  }, [userName]);

  const connectToPeer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!peer || !remoteId.trim()) return;
    
    setStep('chat');
    setRemoteName('Connecting...');
    setConnectionStatus('connecting');
    const conn = peer.connect(remoteId);
    setupConnection(conn);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const msg: any = {
      id: Math.random().toString(36).substring(7),
      senderId: peerId,
      senderName: userName,
      text: text,
      timestamp: Date.now(),
      isMe: true,
      status: connection ? 'sent' : 'queued'
    };

    if (connection) {
      if (sharedSecret) {
        try {
          const { iv, encryptedData } = await encryptData(text, sharedSecret);
          const encryptedPayload = {
            ...msg,
            text: undefined,
            encrypted: true,
            encryptedText: arrayBufferToBase64(encryptedData),
            textIv: arrayBufferToBase64(iv.buffer as ArrayBuffer)
          };
          connection.send({ type: 'chat', payload: encryptedPayload });
        } catch (e) {
          console.error('Encryption failed', e);
          connection.send({ type: 'chat', payload: msg });
        }
      } else {
        connection.send({ type: 'chat', payload: msg });
      }
    } else if (remoteId) {
      // Queue the message
      setQueuedMessages(prev => ({
        ...prev,
        [remoteId]: [...(prev[remoteId] || []), msg]
      }));
    }

    setMessages((prev) => [...prev, msg]);
    
    // Stop typing
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      handleTyping(false);
    }
  };

  const handleTyping = (typing: boolean) => {
    if (connection) {
      connection.send({ type: 'typing', payload: { isTyping: typing } });
    }
  };

  const sendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!connection || !file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      const msg: any = {
        id: Math.random().toString(36).substring(7),
        senderId: peerId,
        senderName: userName,
        timestamp: Date.now(),
        isMe: true,
        status: 'sent',
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          data: arrayBuffer,
          url: URL.createObjectURL(file)
        }
      };

      if (sharedSecret) {
        try {
          const { iv, encryptedData } = await encryptData(arrayBuffer, sharedSecret);
          const encryptedPayload = {
            ...msg,
            encrypted: true,
            file: {
              ...msg.file,
              data: undefined,
              encryptedData: arrayBufferToBase64(encryptedData),
              iv: arrayBufferToBase64(iv.buffer as ArrayBuffer)
            }
          };
          connection.send({ type: 'chat', payload: encryptedPayload });
        } catch (e) {
          console.error('File encryption failed', e);
          connection.send({ type: 'chat', payload: msg });
        }
      } else {
        connection.send({ type: 'chat', payload: msg });
      }

      setMessages((prev) => [...prev, msg]);
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error sharing file:', error);
      alert('Failed to send file. It might be too large.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const startCall = async () => {
    if (!peer || !remoteId || callStatus !== 'idle') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(stream);
      const call = peer.call(remoteId, stream);
      setCallStatus('ringing');
      setIsIncomingCall(false);
      setActiveCall(call);

      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
        setCallStatus('active');
      });

      call.on('close', () => {
        handleCallEnd();
      });

      call.on('error', (err) => {
        console.error('Call error:', err);
        handleCallEnd();
      });
    } catch (err) {
      console.error('Failed to get local stream', err);
      alert('Could not access microphone.');
    }
  };

  const answerCall = async () => {
    if (!activeCall || !isIncomingCall) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(stream);
      activeCall.answer(stream);
      setCallStatus('active');

      activeCall.on('stream', (remoteStream: MediaStream) => {
        setRemoteStream(remoteStream);
      });

      activeCall.on('close', () => {
        handleCallEnd();
      });
    } catch (err) {
      console.error('Failed to get local stream', err);
      activeCall.close();
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    if (activeCall) activeCall.close();
    
    // Log call in history
    if (callStatus !== 'idle') {
      const contact = contacts.find(c => c.id === remoteId);
      const newCall: CallRecord = {
        id: Math.random().toString(36).substring(7),
        peerId: remoteId || activeCall?.peer || 'Unknown',
        peerName: remoteName || contact?.name || 'Unknown Peer',
        timestamp: Date.now(),
        type: isIncomingCall ? (callStatus === 'active' ? 'incoming' : 'missed') : 'outgoing',
        duration: callStatus === 'active' ? callDuration : undefined
      };
      setCallHistory(prev => {
        const updated = [newCall, ...prev].slice(0, 50);
        localStorage.setItem('bluelink_calls', JSON.stringify(updated));
        return updated;
      });
    }

    // Add call summary message if it was an active call
    if (callStatus === 'active' && callDuration > 0) {
      const summaryMsg: Message = {
        id: Math.random().toString(36).substring(7),
        senderId: 'system',
        senderName: 'System',
        text: `Audio call ended • ${formatDuration(callDuration)}`,
        timestamp: Date.now(),
        isMe: false,
        status: 'read'
      };
      setMessages(prev => [...prev, summaryMsg]);
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
    setIsIncomingCall(false);
    setCallDuration(0);
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone for recording.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const sendVoiceMessage = async (blob: Blob) => {
    if (!connection) return;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const msg: any = {
        id: Math.random().toString(36).substring(7),
        senderId: peerId,
        senderName: userName,
        timestamp: Date.now(),
        isMe: true,
        status: connection ? 'sent' : 'queued',
        file: {
          name: `Voice Message ${new Date().toLocaleTimeString()}`,
          size: blob.size,
          type: blob.type,
          data: arrayBuffer,
          url: URL.createObjectURL(blob)
        }
      };

      if (sharedSecret) {
        try {
          const { iv, encryptedData } = await encryptData(arrayBuffer, sharedSecret);
          const encryptedPayload = {
            ...msg,
            encrypted: true,
            file: {
              ...msg.file,
              data: undefined,
              encryptedData: arrayBufferToBase64(encryptedData),
              iv: arrayBufferToBase64(iv.buffer as ArrayBuffer)
            }
          };
          connection.send({ type: 'chat', payload: encryptedPayload });
        } catch (e) {
          console.error('Voice message encryption failed', e);
          connection.send({ type: 'chat', payload: msg });
        }
      } else {
        connection.send({ type: 'chat', payload: msg });
      }
      
      setMessages((prev) => [...prev, msg]);
    } catch (error) {
      console.error('Error sending voice message:', error);
    }
  };

  const saveContact = () => {
    if (!remoteId || !remoteName) return;
    if (contacts.find(c => c.id === remoteId)) {
      alert('Contact already saved');
      return;
    }
    const newContact: Contact = {
      id: remoteId,
      name: remoteName,
      addedAt: Date.now()
    };
    setContacts([...contacts, newContact]);
  };

  const confirmSaveContact = () => {
    if (potentialContact) {
      setContacts(prev => {
        if (prev.some(c => c.id === potentialContact.id)) return prev;
        return [...prev, potentialContact];
      });
      setShowSavePrompt(false);
      setPotentialContact(null);
    }
  };

  const removeContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactId.trim() || !newContactName.trim()) return;
    
    if (contacts.find(c => c.id === newContactId)) {
      alert('This ID is already in your contacts.');
      return;
    }

    const newContact: Contact = {
      id: newContactId.trim(),
      name: newContactName.trim(),
      addedAt: Date.now()
    };
    
    setContacts([...contacts, newContact]);
    setNewContactId('');
    setNewContactName('');
    setShowAddContact(false);
  };

  const connectToContact = (id: string, name: string) => {
    setRemoteId(id);
    setRemoteName(name);
    setStep('chat');
    setConnectionStatus('connecting');
    if (!peer) return;
    const conn = peer.connect(id);
    setupConnection(conn);
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) || 
    c.id.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen max-h-screen bg-app-bg font-sans text-gray-100 overflow-hidden">
      {/* Top Navigation Bar / BlueLink Header */}
      <header className="flex items-center justify-between px-4 h-16 bg-app-sec border-b border-white/5 z-30 shadow-sm">
        <div className="flex items-center gap-3 shrink-0">
          {step === 'chat' && (
            <button 
              onClick={() => setStep('discovery')}
              className="p-1 text-gray-400 hover:text-white"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-brand-blue flex items-center justify-center overflow-hidden">
            {step === 'chat' ? (
              <div className="text-white font-bold">{remoteName.substring(0, 1).toUpperCase()}</div>
            ) : (
              <Bluetooth size={20} className="text-white" />
            )}
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm md:text-base font-semibold truncate max-w-[150px] md:max-w-none">
              {step === 'chat' ? remoteName : (step === 'account' ? 'Profile' : (step === 'calls' ? 'Calls' : (step === 'contacts' ? 'Contacts' : 'BlueLink')))}
            </h1>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] ${
                connectionStatus === 'connected' ? 'text-brand-blue' : 'text-gray-400'
              }`}>
                {step === 'chat' ? (connectionStatus === 'connected' ? 'online' : 'connecting...') : 'P2P Mesh Active'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {step === 'chat' && callStatus === 'idle' && (
            <button onClick={startCall} className="text-gray-400 hover:text-white">
              <Phone size={20} />
            </button>
          )}
          <button onClick={() => setShowId(!showId)} className="text-gray-400 hover:text-white">
            <QrCode size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {step === 'account' && (
            <motion.div
              key="account"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center bg-app-bg p-6 overflow-y-auto"
            >
              <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-40 h-40 rounded-full bg-brand-blue flex items-center justify-center relative overflow-hidden group">
                    <User size={80} className="text-white/50" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Mic size={24} className="text-white" />
                    </div>
                  </div>
                  <div className="w-full space-y-4">
                    <div className="space-y-1">
                      <label className="text-brand-blue text-xs font-semibold px-1">Your Name</label>
                      <input 
                        type="text" 
                        value={userName} 
                        onChange={(e) => setUserName(e.target.value)}
                        className="w-full bg-transparent border-b border-brand-blue py-2 text-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-brand-blue text-xs font-semibold px-1">About / Peer ID</label>
                      <div className="flex items-center gap-2 text-gray-400 text-sm py-2 break-all">
                        {peerId}
                        <button onClick={copyToClipboard} className="text-brand-blue shrink-0"><Copy size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-brand-blue text-xs font-bold uppercase tracking-widest">Settings</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-4 bg-app-sec rounded-xl">
                      <div className="flex items-center gap-3">
                        <Bluetooth size={20} className="text-gray-400" />
                        <span>Mesh Connectivity</span>
                      </div>
                      <div className="w-10 h-5 bg-brand-blue rounded-full relative">
                        <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full"></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-app-sec rounded-xl">
                      <div className="flex items-center gap-3">
                        <QrCode size={20} className="text-gray-400" />
                        <span>Identity QR</span>
                      </div>
                      <ChevronLeft size={16} className="text-gray-600 rotate-180" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {step === 'contacts' && (
            <motion.div
              key="contacts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col bg-app-bg"
            >
              <div className="p-4 border-b border-white/5 bg-app-sec flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-100">Contacts</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 mr-1">{contacts.length} Contacts</span>
                  <button onClick={() => setShowAddContact(true)} className="p-2 text-brand-blue hover:bg-brand-blue/10 rounded-full transition-colors" title="Add Contact">
                    <UserPlus size={20} />
                  </button>
                </div>
              </div>
              
              <div className="p-4">
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    <Search size={18} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search contacts..." 
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="w-full bg-app-sec rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none placeholder:text-gray-500 border border-white/5"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto chat-scroll px-2">
                {contacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-8 opacity-40">
                     <Users size={48} className="text-gray-500 mb-4" />
                     <p className="text-sm">No contacts saved yet.</p>
                     <button 
                       onClick={() => setShowAddContact(true)}
                       className="mt-4 text-brand-blue font-bold text-sm"
                     >
                       Add Your First Contact
                     </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredContacts.map(contact => (
                      <div 
                        key={contact.id}
                        className="flex items-center gap-3 p-4 hover:bg-app-sec cursor-pointer transition-colors border-b border-white/5 rounded-xl mx-2 group"
                        onClick={() => connectToContact(contact.id, contact.name)}
                      >
                        <div className="w-12 h-12 rounded-full bg-brand-blue/20 flex items-center justify-center text-lg font-bold text-brand-blue">
                          {contact.name.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-200 truncate">{contact.name}</h3>
                          <p className="text-xs text-gray-500 truncate font-mono">{contact.id}</p>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeContact(contact.id);
                            }}
                            className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'discovery' && (
            <motion.div
              key="discovery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col md:flex-row relative bg-app-bg"
            >
              <aside className={`
                fixed inset-y-0 left-0 z-40 w-full md:w-96 bg-app-bg border-r border-white/5 transition-transform duration-300 md:relative md:translate-x-0
                ${isSidebarOpen || window.innerWidth >= 768 ? 'translate-x-0' : '-translate-x-full'}
              `}>
                <div className="flex flex-col h-full">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-100">Chats</h2>
                      <div className="flex gap-2">
                         <button onClick={() => setStep('calls')} title="Calls" className="p-2 text-gray-400 hover:text-white transition-colors"><Phone size={20} /></button>
                      </div>
                    </div>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                        <Search size={18} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Search or start new chat" 
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="w-full bg-app-sec rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto chat-scroll pb-20 md:pb-0">
                    <div className="px-4 py-3 bg-brand-blue/10 border-y border-white/5 mx-2 rounded-xl mb-4">
                        <p className="text-[10px] font-bold text-brand-blue uppercase tracking-widest mb-2">Connect New Peer</p>
                        <div className="flex gap-2">
                           <input 
                             type="text" 
                             placeholder="Node Signature" 
                             value={remoteId}
                             onChange={(e) => setRemoteId(e.target.value)}
                             className="flex-1 bg-app-sec rounded-lg px-3 py-2 text-xs text-white outline-none border border-white/5 focus:border-brand-blue/50"
                           />
                           <button 
                             onClick={connectToPeer}
                             disabled={!remoteId.trim()}
                             className="bg-brand-blue text-white px-4 py-2 rounded-lg disabled:opacity-50 font-bold text-xs"
                           >
                             Connect
                           </button>
                        </div>
                    </div>
                    {contacts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center px-8 opacity-40">
                         <Bluetooth size={48} className="text-gray-500 mb-4" />
                         <p className="text-sm">No chats found.<br/>Link a peer to begin.</p>
                      </div>
                    ) : (
                      filteredContacts.map(contact => (
                        <div 
                          key={contact.id}
                          className="flex items-center gap-3 p-4 hover:bg-app-sec cursor-pointer transition-colors border-b border-white/5"
                          onClick={() => {
                            connectToContact(contact.id, contact.name);
                            setIsSidebarOpen(false);
                          }}
                        >
                          <div className="w-12 h-12 rounded-full bg-brand-blue/20 flex items-center justify-center text-lg font-bold text-brand-blue">
                            {contact.name.substring(0, 1).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <h3 className="font-semibold text-gray-200 truncate">{contact.name}</h3>
                              <span className="text-[10px] text-gray-500">{new Date(contact.addedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500 truncate">
                              <Check size={14} className="text-brand-blue" />
                              <span className="truncate">{contact.id}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </aside>
              <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-app-bg p-12 text-center relative overflow-hidden">
                 <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cartographer.png")' }}></div>
                 <div className="w-24 h-24 bg-app-sec rounded-full flex items-center justify-center mb-8 border border-white/10">
                    <MessageSquare size={48} className="text-gray-600" />
                 </div>
                 <h2 className="text-2xl font-bold mb-2">BlueLink P2P Mesh</h2>
                 <p className="text-gray-500 max-w-sm">Direct, encrypted device-to-device messaging. No servers required.</p>
              </div>
            </motion.div>
          )}

          {step === 'calls' && (
            <motion.div
              key="calls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col bg-app-bg"
            >
              <div className="p-4 border-b border-white/5 bg-app-sec">
                <h2 className="text-xl font-bold text-gray-100">Calls</h2>
              </div>
              <div className="flex-1 overflow-y-auto chat-scroll px-2 py-2">
                {callHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-8 opacity-40">
                    <div className="w-20 h-20 bg-app-sec rounded-full flex items-center justify-center mb-6">
                      <Phone size={40} className="text-gray-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">No calls yet</h3>
                    <p className="text-sm">Link with a peer to start encrypted voice calls.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {callHistory.map(call => (
                      <div 
                        key={call.id} 
                        className="flex items-center gap-3 p-4 hover:bg-app-sec cursor-pointer transition-colors border-b border-white/5 rounded-xl mx-2"
                        onClick={() => {
                          setRemoteId(call.peerId);
                          setRemoteName(call.peerName);
                          setStep('chat');
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-brand-blue/20 flex items-center justify-center text-lg font-bold text-brand-blue">
                          {call.peerName.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-200 truncate">{call.peerName}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            {call.type === 'incoming' && <PhoneIncoming size={12} className="text-brand-blue" />}
                            {call.type === 'outgoing' && <PhoneOutgoing size={12} className="text-brand-blue" />}
                            {call.type === 'missed' && <PhoneMissed size={12} className="text-red-500" />}
                            <span>{new Date(call.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {call.duration && <span>• {formatDuration(call.duration)}</span>}
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation();
                            setRemoteId(call.peerId);
                            setRemoteName(call.peerName);
                            startCall(); 
                          }} 
                          className="p-3 text-brand-blue hover:bg-brand-blue/10 rounded-full transition-colors"
                        >
                          <Phone size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col bg-app-bg relative"
            >
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cartographer.png")' }}></div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 chat-scroll relative z-10 pb-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20 px-8">
                     <div className="bg-brand-blue/10 text-brand-blue px-4 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-widest mb-8 border border-brand-blue/20 backdrop-blur-sm">
                        Messages are end-to-end encrypted
                     </div>
                  </div>
                )}
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      relative px-3 py-1.5 shadow-md flex flex-col min-w-[80px]
                      ${msg.isMe ? 'bg-app-bubble-out text-gray-100 rounded-lg rounded-tr-none ml-12' : 'bg-app-bubble-in text-gray-100 rounded-lg rounded-tl-none mr-12'}
                    `}>
                      <div className={`absolute top-0 w-2 h-2 ${msg.isMe ? '-right-2' : '-left-2'} overflow-hidden`}>
                         <div className={`w-4 h-4 rotate-45 ${msg.isMe ? 'bg-app-bubble-out -translate-x-2' : 'bg-app-bubble-in translate-x-2'}`}></div>
                      </div>
                      {msg.text && <p className="text-sm whitespace-pre-wrap leading-normal mb-1">{msg.text}</p>}
                      {msg.file && (
                        <div className="mb-1 p-2 bg-black/20 rounded-lg border border-white/5">
                           <div className="flex items-center gap-3">
                              <FileText size={28} className="text-brand-blue shrink-0" />
                              <div className="flex-1 min-w-0">
                                 <p className="text-xs font-bold truncate">{msg.file.name}</p>
                                 <p className="text-[10px] text-gray-400 capitalize">{formatFileSize(msg.file.size)}</p>
                              </div>
                              {msg.file.url && (
                                <a href={msg.file.url} download={msg.file.name} className="text-brand-blue p-1">
                                   <Download size={18} />
                                </a>
                              )}
                           </div>
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-1 self-end">
                        <span className="text-[9px] text-gray-400 uppercase">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.isMe && <Check size={12} className={msg.status === 'read' ? 'text-blue-400' : 'text-gray-400'} />}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-app-bubble-in px-4 py-2 rounded-xl rounded-tl-none flex gap-1">
                      <div className="w-1 h-1 bg-brand-blue rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-brand-blue rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1 h-1 bg-brand-blue rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="bg-app-sec p-2 flex items-end gap-2 relative z-10">
                <button onClick={() => fileInputRef.current?.click()} className="p-3 text-gray-400 hover:text-white">
                  <Paperclip size={24} />
                </button>
                <input type="file" ref={fileInputRef} onChange={sendFile} className="hidden" />
                <div className="flex-1 bg-app-bg rounded-[24px] flex items-end px-4 py-2 min-h-[48px]">
                   <textarea
                     placeholder="Type a message"
                     rows={1}
                     className="w-full bg-transparent border-none outline-none resize-none text-sm py-1.5 text-gray-100"
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         sendMessage((e.target as HTMLTextAreaElement).value);
                         (e.target as HTMLTextAreaElement).value = '';
                       }
                     }}
                   />
                </div>
                <button onClick={() => sendMessage((document.querySelector('textarea') as HTMLTextAreaElement).value)} className="bg-brand-blue text-white p-3 rounded-full shadow-lg">
                  <Send size={20} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal for Save Contact Prompt */}
        <AnimatePresence>
          {showSavePrompt && potentialContact && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-app-sec w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-white/10 text-center"
              >
                <div className="w-20 h-20 bg-brand-blue/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <UserPlus size={40} className="text-brand-blue" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Save New Contact?</h3>
                <p className="text-gray-400 text-sm mb-8">
                  Would you like to save <span className="text-brand-blue font-bold">{potentialContact.name}</span> to your contacts?
                </p>
                
                <div className="bg-black/40 rounded-2xl p-4 mb-8 text-left border border-white/5">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Peer ID</div>
                  <div className="text-xs font-mono text-gray-300 break-all">{potentialContact.id}</div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={confirmSaveContact}
                    className="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl shadow-xl shadow-brand-blue/10 active:scale-[0.98] transition-all"
                  >
                    Save Contact
                  </button>
                  <button 
                    onClick={() => {
                      setShowSavePrompt(false);
                      setPotentialContact(null);
                    }}
                    className="w-full py-3 text-gray-500 font-bold hover:text-white transition-colors"
                  >
                    Not Now
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal for Add Contact */}
        <AnimatePresence>
          {showAddContact && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-app-sec w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-white/10"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Add New Contact</h3>
                  <button onClick={() => setShowAddContact(false)} className="text-gray-500 hover:text-white">
                    <ChevronLeft size={24} className="rotate-180" />
                  </button>
                </div>
                
                <form onSubmit={handleAddContact} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-blue uppercase tracking-widest block ml-1">Contact Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Alice Smith"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl py-3.5 px-4 text-white focus:outline-none focus:border-brand-blue/50 transition-colors"
                      autoFocus
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-blue uppercase tracking-widest block ml-1">Peer ID / Signature</label>
                    <input 
                      type="text" 
                      placeholder="Paste ID here..."
                      value={newContactId}
                      onChange={(e) => setNewContactId(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl py-3.5 px-4 text-white font-mono text-sm focus:outline-none focus:border-brand-blue/50 transition-colors"
                    />
                  </div>

                  <div className="pt-2">
                    <button 
                      type="submit"
                      disabled={!newContactId.trim() || !newContactName.trim()}
                      className="w-full bg-brand-blue text-white font-bold py-4 rounded-2xl shadow-xl shadow-brand-blue/10 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      Save Contact
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Overlay for QR Code */}
        <AnimatePresence>
          {showId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 p-8 flex flex-col items-center justify-center text-center"
            >
              <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8">
                <QRCodeSVG value={peerId} size={220} />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-white">Your Peer ID</h3>
              <p className="text-gray-400 mb-8 text-sm max-w-xs mx-auto">Share this code with others to establish a direct P2P connection.</p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button onClick={copyToClipboard} className="flex items-center justify-center gap-2 w-full py-3.5 bg-app-sec border border-white/10 rounded-2xl font-semibold text-gray-200">
                  {copySuccess ? <Check size={18} className="text-brand-blue" /> : <Copy size={18} className="text-brand-blue" />}
                  {copySuccess ? 'Copied!' : 'Copy ID String'}
                </button>
                <button onClick={() => setShowId(false)} className="w-full py-4 text-brand-blue font-bold uppercase tracking-widest text-sm">Close</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Call UI Overlay */}
        <AnimatePresence>
          {callStatus !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="absolute inset-0 bg-app-bg z-40 flex flex-col items-center justify-between py-20"
            >
              <div className="text-center space-y-4">
                <div className="w-24 h-24 rounded-full bg-black/10 flex items-center justify-center mx-auto border-4 border-white/20">
                    <User size={64} className="text-white/50" />
                </div>
                <h2 className="text-3xl font-bold text-white">{remoteName || 'Peer'}</h2>
                <div className="flex items-center justify-center gap-2 text-white/70 font-medium">
                   {callStatus === 'ringing' ? (isIncomingCall ? 'Connection Incoming' : 'Ringing...') : formatDuration(callDuration)}
                </div>
                {callStatus === 'active' && (
                  <div className="flex justify-center mt-2">
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isMuted ? 'bg-red-500/30 text-red-200 border border-red-500/50' : 'bg-white/10 text-brand-blue border border-white/10'}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${isMuted ? 'bg-red-500' : 'bg-brand-blue animate-pulse'}`} />
                      {isMuted ? 'Microphone Muted' : 'Microphone Active'}
                    </motion.div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-8 w-full px-10">
                {localStream && (
                  <button onClick={toggleMute} className={`p-5 rounded-full ${isMuted ? 'bg-red-500 text-white' : 'bg-white/20 text-white'} transition-all active:scale-95 shadow-lg`}>
                    {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                  </button>
                )}
                {isIncomingCall && callStatus === 'ringing' ? (
                  <button onClick={answerCall} className="p-6 bg-brand-blue text-white rounded-full"><Phone size={32} /></button>
                ) : null}
                <button onClick={handleCallEnd} className="p-6 bg-red-500 text-white rounded-full"><PhoneOff size={32} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      </main>

      <footer className="md:hidden flex items-center justify-around h-16 bg-app-sec border-t border-white/5">
        <button onClick={() => setStep('discovery')} className={`flex flex-col items-center gap-1 ${step === 'discovery' ? 'text-brand-blue' : 'text-gray-500'}`}>
          <MessageSquare size={20} /><span className="text-[10px] font-medium">Chats</span>
        </button>
        <button onClick={() => setStep('contacts')} className={`flex flex-col items-center gap-1 ${step === 'contacts' ? 'text-brand-blue' : 'text-gray-500'}`}>
          <Users size={20} /><span className="text-[10px] font-medium">Contacts</span>
        </button>
        <button onClick={() => setStep('calls')} className={`flex flex-col items-center gap-1 ${step === 'calls' ? 'text-brand-blue' : 'text-gray-500'}`}>
          <Phone size={20} /><span className="text-[10px] font-medium">Calls</span>
        </button>
        <button onClick={() => setStep('account')} className={`flex flex-col items-center gap-1 ${step === 'account' ? 'text-brand-blue' : 'text-gray-500'}`}>
          <User size={20} /><span className="text-[10px] font-medium">Profile</span>
        </button>
      </footer>

      <footer className="hidden md:flex h-8 bg-app-sec border-t border-white/5 px-6 items-center justify-between text-[11px] text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-brand-blue' : 'bg-yellow-500 animate-pulse'}`} />{connectionStatus === 'connected' ? 'Secure P2P Channel Active' : 'Searching for Peers...'}</span>
          <span className="opacity-50">Local ID: {peerId}</span>
        </div>
        <div className="font-mono opacity-50 uppercase tracking-tighter">BlueLink v2.0 • Encryption: AES-GCM</div>
      </footer>
    </div>
  );
}
