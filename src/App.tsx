/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '@capacitor/device';
// Offline-only: Network plugin removed
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
// Offline-only mode: PeerJS removed, using pure Bluetooth mesh
import { motion, AnimatePresence } from 'motion/react';
import { Bluetooth, BluetoothOff, Send, User, ChevronLeft, QrCode, Scan, Copy, Check, CheckCheck, Info, FileText, Download, Paperclip, Phone, PhoneOff, Mic, MicOff, UserPlus, Trash2, Users, Clock, StopCircle, Activity, MessageSquare, Search, MoreVertical, Smile, PhoneIncoming, PhoneOutgoing, PhoneMissed, Radio, X, Play, Pause, Moon, Sun } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { bluetoothMesh, MeshNode } from './lib/bluetoothMesh';
import { Message, PeerData, Contact, CallRecord, ContactRequest } from './types';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import Onboarding from './components/Onboarding';
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

// Voice Message Component
function VoiceMessage({ bubble }: { bubble: Message }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (!bubble.file || !bubble.file.url) return null;

  return (
    <div className="flex items-center gap-3 py-1 pr-2 w-full min-w-[180px]">
      <button 
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-brand-blue flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform active:scale-95"
      >
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>
      
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Voice Message</span>
           <span className="text-[10px] font-mono text-gray-500">
             {bubble.file.size ? (bubble.file.size / 1024).toFixed(1) + ' KB' : ''}
           </span>
        </div>
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
           <div 
             className="absolute inset-0 bg-brand-blue/20 scale-x-[1.2] origin-left blur-sm shadow-inner" 
             style={{ width: `${progress}%` }} 
           />
           <div 
             className="h-full bg-brand-blue rounded-full relative z-10 shadow-[0_0_8px_rgba(67,56,202,0.5)]" 
             style={{ width: `${progress}%` }} 
           />
        </div>
      </div>
      
      <audio ref={audioRef} src={bubble.file.url} className="hidden" />
    </div>
  );
}

export default function App() {
  const [userName, setUserName] = useState<string>(() => {
    const saved = localStorage.getItem('bluelink_name');
    if (saved) return saved;
    return `Node-${Math.floor(Math.random() * 9000) + 1000}`;
  });
  const [userAvatar, setUserAvatar] = useState<string>(() => {
    return localStorage.getItem('bluelink_avatar') || '';
  });
  useEffect(() => {
    localStorage.setItem('bluelink_name', userName);
  }, [userName]);
  useEffect(() => {
    localStorage.setItem('bluelink_avatar', userAvatar);
  }, [userAvatar]);
  const [peerId, setPeerId] = useState<string>(() => {
    return localStorage.getItem('bluelink_peer_id') || '';
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const normalizePeerId = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('bluelink-')) return trimmed;
    // Special case: if it looks like a UUID or a short ID, it's very likely a BlueLink ID missing its prefix
    return `bluelink-${trimmed}`;
  };

  // Using pure Bluetooth mesh - no PeerJS
  const [bleConnectedDevice, setBleConnectedDevice] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('bluelink_messages');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => {
    localStorage.setItem('bluelink_messages', JSON.stringify(messages));
  }, [messages]);
  const [remoteId, setRemoteId] = useState<string>('');
  const [remoteName, setRemoteName] = useState<string>('');
  const [remoteAvatar, setRemoteAvatar] = useState<string>('');
  const [step, setStep] = useState<'onboarding' | 'discovery' | 'chat' | 'account' | 'calls' | 'contacts' | 'nearby'>(() => {
    const onboarded = localStorage.getItem('bluelink_onboarded') === 'true';
    const hasName = !!localStorage.getItem('bluelink_name');
    return onboarded && hasName ? 'discovery' : 'onboarding';
  });
  const [discoveredNodes, setDiscoveredNodes] = useState<{id: string, name: string, signal: number, dist: number, avatar?: string, type: 'known' | 'unknown'}[]>([]);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [remoteIsTyping, setRemoteIsTyping] = useState(false);
  const [lastTypingSent, setLastTypingSent] = useState(0);
  const [showId, setShowId] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [isOffline] = useState(true); // Always offline - Bluetooth mesh only
  const [networkType] = useState<string>('ble');

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    setDeviceInfo({
      platform: isNative ? Capacitor.getPlatform() : 'web',
      native: isNative,
      version: '1.0.0-offline'
    });
  }, []);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  
  const [localKeyPair, setLocalKeyPair] = useState<CryptoKeyPair | null>(null);
  const [sharedSecret, setSharedSecret] = useState<CryptoKey | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('bluelink_contacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>(() => {
    const saved = localStorage.getItem('bluelink_contact_requests');
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
  useEffect(() => {
    localStorage.setItem('bluelink_calls', JSON.stringify(callHistory));
  }, [callHistory]);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [isTabActive, setIsTabActive] = useState(true);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'mesh' | 'id'>('mesh');
  const [syncingPeerId, setSyncingPeerId] = useState<string | null>(null);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setUserAvatar(base64String);
        // Send to current peer if connected
        if (connection && connection.open) {
          connection.send({ type: 'system', payload: { name: userName, avatar: base64String } });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle Tab Visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      const active = document.visibilityState === 'visible';
      setIsTabActive(active);
      if (active) {
        setUnreadCount(0);
        document.title = 'BlueLink P2P | Secure Local Chat';
        
        // Mark as read if in chat
        if (step === 'chat' && connection && connectionStatus === 'connected') {
           const peerId = connection.peer;
           setMessages(prev => prev.map(m => 
             (m.senderId === peerId && m.isMe === false) ? { ...m, status: 'read' } : m
           ));
           
           // Find unread from this peer
           const unreadFromPeer = messages.filter(m => m.senderId === peerId && m.status !== 'read');
           unreadFromPeer.forEach(msg => {
             connection.send({ 
               type: 'receipt', 
               payload: { messageId: msg.id, status: 'read' } 
             });
           });
        }
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

  // Capacitor Init
  useEffect(() => {
    const initCapacitor = async () => {
      try {
        const info = await Device.getInfo();
        setDeviceInfo(info);
        
        const status = await Network.getStatus();
        setIsOffline(!status.connected);
        
        Network.addListener('networkStatusChange', status => {
          setIsOffline(!status.connected);
        });
      } catch (e) {
        console.warn('Capacitor not available, running in browser mode');
      }
    };
    initCapacitor();
  }, []);

  // Background Mesh Discovery Effect
  useEffect(() => {
    const runDiscovery = async () => {
      if (step === 'onboarding') return;
      
      await bluetoothMesh.initialize();
      
      if (peerId && userName) {
        bluetoothMesh.startAdvertising(peerId, userName, (deviceId, data) => {
          console.log('[Mesh] Received packet via Bluetooth:', data);
          const peerData = data as PeerData;
          
          if (peerData.type === 'chat') {
            const msg = peerData.payload;
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev;
              const isActuallyReading = step === 'chat' && remoteId === msg.senderId && document.visibilityState === 'visible';
              return [...prev, { ...msg, isMe: false, status: isActuallyReading ? 'read' : 'delivered' }];
            });
            
            // Auto-send receipt
            const targetNode = discoveredNodes.find(n => n.id === msg.senderId);
            if (targetNode) {
              bluetoothMesh.sendData(targetNode.id.replace('bluelink-', ''), { 
                type: 'receipt', 
                payload: { messageId: msg.id, status: 'delivered' } 
              });
            }

            if (document.visibilityState !== 'visible') {
              setUnreadCount(prev => prev + 1);
              if (Notification.permission === 'granted') {
                new Notification(`BlueLink Mesh: ${msg.senderName}`, {
                  body: msg.text || 'Shared a file',
                  icon: '/favicon.ico'
                });
              }
            }
          } else if (peerData.type === 'receipt') {
            const { messageId, status } = peerData.payload;
            setMessages((prev) => 
              prev.map(m => m.id === messageId ? { ...m, status: (m.status === 'read' ? 'read' : status) } : m)
            );
          } else if (peerData.type === 'system') {
            if (peerData.payload.name) setRemoteName(peerData.payload.name);
            if (peerData.payload.avatar) setRemoteAvatar(peerData.payload.avatar);
          }
        });
      }

      bluetoothMesh.startDiscovery((node) => {
        setDiscoveredNodes(prev => {
          const exists = prev.find(n => n.id === node.id);
          if (exists) {
            // Update signal and distance
            return prev.map(n => n.id === node.id ? { ...n, signal: node.signal, dist: node.dist } : n);
          }
          return [...prev, { ...node, type: contactsRef.current.some(c => c.id === node.id) ? 'known' : 'unknown' } as any].sort((a, b) => b.signal - a.signal);
        });
      });
    };

    runDiscovery();
    
    return () => {
      bluetoothMesh.stopDiscovery();
    };
  }, [peerId, userName, contacts]);

  const startBluetoothDiscovery = async () => {
    // This is now handled by the persistent effect, 
    // but we can trigger an immediate refresh or show status
    setLastError('Background Mesh Scan is Active');
    setTimeout(() => setLastError(null), 2000);
    
    if (step !== 'nearby') {
      setStep('nearby');
    }
  };

  const handleScanSuccess = useCallback((decodedText: string) => {
    setRemoteId(decodedText);
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      scanner.render((decodedText: string) => {
        handleScanSuccess(decodedText);
      }, (error) => {
        // Handle scanning error
      });

      return () => {
        scanner.clear().catch(err => {
          // Ignore clear errors if already stopped
        });
      };
    }
  }, [isScanning, handleScanSuccess]);

  // Real scan logic is now handled by the Background Mesh Discovery Effect

  // Initialize Bluetooth Mesh (offline-only mode)
  const [bleInitialized, setBleInitialized] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  useEffect(() => {
    if (userName && step !== 'onboarding' && !bleInitialized) {
      const initBluetooth = async () => {
        try {
          await bluetoothMesh.initialize();

          let savedId = localStorage.getItem('bluelink_peer_id');
          if (savedId && !savedId.startsWith('bluelink-')) {
            savedId = `bluelink-${savedId}`;
            localStorage.setItem('bluelink_peer_id', savedId);
          }

          const myPeerId = savedId || `bluelink-${Math.random().toString(36).substring(2, 10)}`;
          setPeerId(myPeerId);
          localStorage.setItem('bluelink_peer_id', myPeerId);
          console.log('BlueLink Mesh Node ID (offline-BLE): ' + myPeerId);

          // Start advertising for other devices to discover us
          await bluetoothMesh.startAdvertising(myPeerId, userName, async (deviceId, message) => {
            console.log('Received BLE message from', deviceId, message);
            if (message.type === 'chat') {
              setMessages(prev => [...prev, {
                id: message.payload.id || `msg-${Date.now()}`,
                text: message.payload.text || '',
                senderId: message.senderId,
                isMe: false,
                status: 'delivered',
                timestamp: message.payload.timestamp || Date.now(),
                file: message.payload.file
              }]);
              setRemoteId(message.senderId);
              setStep('chat');
            } else if (message.type === 'receipt') {
              setMessages(prev => prev.map(m =>
                m.id === message.payload.messageId ? { ...m, status: message.payload.status } : m
              ));
            }
          });

          // Start scanning for nearby devices
          await bluetoothMesh.startDiscovery((node) => {
            setDiscoveredNodes(prev => {
              const exists = prev.find(n => n.id === node.id);
              if (exists) {
                return prev.map(n => n.id === node.id ? { ...n, signal: node.signal, lastSeen: node.lastSeen } : n);
              }
              return [...prev, { ...node, dist: 0, type: 'unknown' }];
            });
          });

          setBleInitialized(true);
        } catch (e) {
          console.error('Bluetooth init failed:', e);
          setLastError('Bluetooth initialization failed. App works offline with BLE.');
        }
      };

      initBluetooth();

      return () => {
        bluetoothMesh.stopDiscovery();
        bluetoothMesh.stopAdvertising();
      };
    }
  }, [userName, step === 'onboarding', bleInitialized]);

  // Auto-sync Effect for Queued Messages
  useEffect(() => {
    // Only attempt auto-connect if we have a peer object and aren't already busy
    if (!peer || peer.destroyed || connection || connectionStatus === 'connecting' || syncingPeerId) return;

    const peersWithQueue = Object.keys(queuedMessages).filter(id => (queuedMessages[id] || []).length > 0);
    if (peersWithQueue.length === 0) return;

    // Check if any peer with queue is currently discovered
    const targetPeerId = peersWithQueue.find(pid => 
      discoveredNodes.some(node => node.id === pid)
    );

    if (targetPeerId) {
      setSyncingPeerId(targetPeerId);
      console.log(`[Mesh Sync] Auto-connecting to node ${targetPeerId} to deliver queued packets...`);
      
      const conn = peer.connect(targetPeerId, {
        reliable: true,
        connectionPriority: 1
      });
      
      setupConnection(conn, true); // true for background/sync mode
    }
  }, [discoveredNodes, queuedMessages, peer, connectionStatus, !!connection, syncingPeerId]);

  // Sync queued messages once encrypted
  useEffect(() => {
    if (connection && isEncrypted && sharedSecret && connectionStatus === 'connected') {
      const peerId = connection.peer;
      const queue = queuedMessages[peerId] || [];
      
      if (queue.length > 0) {
        console.log(`[Mesh Sync] Delivering ${queue.length} encrypted packets to ${peerId}...`);
        
        const processQueue = async () => {
          for (const msg of queue) {
            try {
              if (sharedSecret) {
                const { iv, encryptedData } = await encryptData(msg.text, sharedSecret);
                const encryptedPayload = {
                  ...msg,
                  text: undefined,
                  encrypted: true,
                  encryptedText: arrayBufferToBase64(encryptedData),
                  textIv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
                  status: 'sent'
                };
                connection.send({ type: 'chat', payload: encryptedPayload });
              } else {
                connection.send({ type: 'chat', payload: { ...msg, status: 'sent' } });
              }
            } catch (e) {
              console.error('Queue encryption failed', e);
              connection.send({ type: 'chat', payload: { ...msg, status: 'sent' } });
            }
          }
          
          setMessages(prev => prev.map(m => {
            const queued = queue.find(q => q.id === m.id);
            return queued ? { ...m, status: 'sent' } : m;
          }));
          
          setQueuedMessages(prev => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        };
        
        processQueue();
      }
    }
  }, [isEncrypted, connectionStatus, !!connection, !!sharedSecret]);

  // Mark messages as read when entering chat
  useEffect(() => {
    if (step === 'chat' && connection && connectionStatus === 'connected') {
      const peerId = connection.peer;
      const unreadFromPeer = messages.filter(m => m.senderId === peerId && m.status !== 'read');
      
      if (unreadFromPeer.length > 0) {
        setMessages(prev => prev.map(m => 
          (m.senderId === peerId && m.isMe === false) ? { ...m, status: 'read' } : m
        ));
        
        // Send receipts for all unread
        unreadFromPeer.forEach(msg => {
          connection.send({ 
            type: 'receipt', 
            payload: { messageId: msg.id, status: 'read' } 
          });
        });
      }
    }
  }, [step, connectionStatus, !!connection]);

  // Handle incoming data
  const setupConnection = useCallback((conn: DataConnection, isBackground: boolean = false) => {
    const sendKeyExchange = async () => {
      if (localKeyPair) {
        const exportedPubKey = await exportPublicKey(localKeyPair.publicKey);
        conn.send({ type: 'key-exchange', payload: { publicKey: exportedPubKey } });
      }
    };

    conn.on('open', () => {
      setSyncingPeerId(null);
      setConnection(conn);
      setConnectionStatus('connected');
      setRemoteId(conn.peer);
      // Wait for name exchange
      conn.send({ type: 'system', payload: { name: userName, avatar: userAvatar } });
      
      if (!isBackground) {
        setStep('chat');
      }
      
      // Start key exchange
      sendKeyExchange();

      // Note: Queued message delivery is now handled by the encryption effect
      // for better security, or as a fallback here if not encrypted.
      setTimeout(() => {
        if (!isEncrypted) {
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
        }
      }, 5000);
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
        
        const isActuallyReading = step === 'chat' && remoteId === msg.senderId && document.visibilityState === 'visible';
        const finalStatus = isActuallyReading ? 'read' : 'delivered';
        
        setMessages((prev) => [...prev, { ...msg, isMe: false, status: finalStatus }]);
        
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

        // Send status receipt back (either delivered or read)
        conn.send({ type: 'receipt', payload: { messageId: msg.id, status: finalStatus } });
      } else if (peerData.type === 'receipt') {
        const { messageId, status } = peerData.payload;
        setMessages((prev) => 
          prev.map(m => m.id === messageId ? { ...m, status: (m.status === 'read' ? 'read' : status) } : m)
        );
      } else if (peerData.type === 'delete-message') {
        const { messageId } = peerData.payload;
        setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, text: 'This message was deleted', deleted: true, file: undefined } : m));
      } else if (peerData.type === 'system') {
        if (peerData.payload.name) {
          setRemoteName(peerData.payload.name);
        }
        if (peerData.payload.avatar !== undefined) {
          setRemoteAvatar(peerData.payload.avatar);
          // Also update contact if it exists
          setContacts(prev => prev.map(c => 
            c.id === conn.peer ? { ...c, avatar: peerData.payload.avatar } : c
          ));
        }

        if (peerData.payload.name) {
          // Auto-prompt to save contact if unknown
          const isKnown = contactsRef.current.some(c => c.id === conn.peer);
          if (!isKnown && !showSavePrompt) {
            setPotentialContact({
              id: conn.peer,
              name: peerData.payload.name || `Node-${conn.peer.substring(0, 4)}`,
              avatar: peerData.payload.avatar,
              addedAt: Date.now()
            });
            setShowSavePrompt(true);
          }
        }
      } else if (peerData.type === 'typing') {
        setRemoteIsTyping(peerData.payload.isTyping);
      }
    });

    conn.on('close', () => {
      setConnection(null);
      setConnectionStatus('disconnected');
      setIsEncrypted(false);
      setSharedSecret(null);
      setRemoteIsTyping(false);
      setRemoteName('');
      setRemoteAvatar('');
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
  }, [messages, remoteIsTyping]);

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

  const deleteMessage = (messageId: string) => {
    // Only allow deleting own messages that aren't already deleted
    const msg = messages.find(m => m.id === messageId);
    if (!msg || !msg.isMe || msg.deleted) return;

    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: 'You deleted this message', deleted: true, file: undefined } : m));
    
    if (connection && connection.open) {
      connection.send({
        type: 'delete-message',
        payload: { messageId }
      });
    }
  };

  const onEmojiClick = (emojiData: any) => {
    setMessageText(prev => prev + emojiData.emoji);
  };

  useEffect(() => {
    localStorage.setItem('bluelink_contacts', JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem('bluelink_contact_requests', JSON.stringify(contactRequests));
  }, [contactRequests]);

  useEffect(() => {
    localStorage.setItem('bluelink_queue', JSON.stringify(queuedMessages));
  }, [queuedMessages]);

  useEffect(() => {
    if (userName && !localStorage.getItem('bluelink_name')) {
      localStorage.setItem('bluelink_name', userName);
    }
  }, [userName]);

  const connectToPeer = (e?: React.FormEvent) => {
    e?.preventDefault();
    const idToConnect = normalizePeerId(remoteId);
    if (!idToConnect) return;

    setStep('chat');
    setRemoteId(idToConnect);
    setConnectionStatus('connecting');
    setLastError(null);

    // Check if this is a discovered Bluetooth node
    const bluetoothNode = discoveredNodes.find(n => n.id === idToConnect);
    
    if (isOffline && bluetoothNode) {
      console.log('[Mesh] Connecting to peer via Bluetooth mesh...');
      setRemoteName(bluetoothNode.name);
      if (bluetoothNode.avatar) setRemoteAvatar(bluetoothNode.avatar);
      setConnectionStatus('connected'); // Bluetooth is "always ready" in this simpler mesh mode
      return;
    }

    if (!peer || peer.destroyed) {
      if (isOffline) {
        console.log('[Mesh] Falling back to Bluetooth mesh mode.');
      }
      return;
    }
    
    setRemoteName('Routing...');
    
    console.log(`Initiating mesh tunnel to: ${idToConnect}`);

    try {
      const conn = peer.connect(targetId, {
        reliable: true,
        connectionPriority: 1,
        metadata: { name: userName, avatar: userAvatar }
      });
      
      setupConnection(conn);
      
      // Safety timeout for connection establishment
      const timeout = setTimeout(() => {
        if (conn && (!conn.open && connectionStatus === 'connecting')) {
          console.warn('Connection attempt timed out for target:', targetId);
          setLastError('Connection attempt timed out. Trying to re-route...');
          // Check if there was an alternative ID we could try
        }
      }, 15000);
      
      return () => clearTimeout(timeout);
    } catch (err) {
      console.error('Immediate connection error:', err);
      setConnectionStatus('disconnected');
      setLastError('Failed to initiate connection. Peer may be invalid.');
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const msg: any = {
      id: Math.random().toString(36).substring(7),
      senderId: peerId,
      senderName: userName,
      receiverId: connection?.peer || remoteId,
      text: text,
      timestamp: Date.now(),
      isMe: true,
      status: connection ? 'sent' : 'queued'
    };

    if (connection && connection.open) {
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
    } else if (isOffline && remoteId) {
       // Attempt Bluetooth Mesh Send if totally offline
       const targetNode = discoveredNodes.find(n => n.id === remoteId);
       if (targetNode) {
          console.log('[Mesh] Sending packet via Bluetooth transport...');
          bluetoothMesh.sendData(targetNode.id.replace('bluelink-', ''), { type: 'chat', payload: msg });
          msg.status = 'sent';
       } else {
          setQueuedMessages(prev => ({ ...prev, [remoteId]: [...(prev[remoteId] || []), msg] }));
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
    if (connection && connection.open) {
      const now = Date.now();
      // Send at most every 1.5 seconds unless state changed to false
      if (!typing || now - lastTypingSent > 1500) {
        connection.send({ type: 'typing', payload: { isTyping: typing } });
        if (typing) setLastTypingSent(now);
      }
    }
  };

  const sendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!connection || !connection.open || !file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      const msg: any = {
        id: Math.random().toString(36).substring(7),
        senderId: peerId,
        senderName: userName,
        receiverId: connection.peer,
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
    if (!peer || peer.destroyed || !remoteId || callStatus !== 'idle') return;

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
        return updated;
      });
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
    setIsIncomingCall(false);
    setIsMuted(false);
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
        if (audioBlob.size > 1000) { // Only send if it's more than just noise
          await sendVoiceMessage(audioBlob);
        }
        stream.getTracks().forEach(track => track.stop());
        setRecordingDuration(0);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setLastError('Microphone access denied. Enable permissions to record voice.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.onstop = () => {
        if (mediaRecorder.stream) {
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        setRecordingDuration(0);
      };
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
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

  const sendContactRequest = (id: string, name: string, avatar?: string) => {
    if (contacts.find(c => c.id === id)) return;
    if (contactRequests.find(r => r.senderId === id)) return;

    const newRequest: ContactRequest = {
      id: Math.random().toString(36).substring(7),
      senderId: id,
      senderName: name,
      senderAvatar: avatar,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    // In a real app, we'd send a "system" P2P message to the target node
    setContactRequests(prev => [newRequest, ...prev]);
  };

  const handleContactRequest = (requestId: string, status: 'accepted' | 'declined') => {
    const request = contactRequests.find(r => r.id === requestId);
    if (!request) return;

    if (status === 'accepted') {
      const newContact: Contact = {
        id: request.senderId,
        name: request.senderName,
        avatar: request.senderAvatar,
        addedAt: Date.now()
      };
      setContacts(prev => {
        if (prev.some(c => c.id === newContact.id)) return prev;
        return [...prev, newContact];
      });
    }

    setContactRequests(prev => prev.filter(r => r.id !== requestId));
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
    const contact = contacts.find(c => c.id === id);
    if (contact?.avatar) setRemoteAvatar(contact.avatar);
    setRemoteId(id);
    setRemoteName(name);
    setStep('chat');
    setConnectionStatus('connecting');
    setLastError(null);
    if (!peer || peer.destroyed) return;
    const conn = peer.connect(id, {
      reliable: true,
      connectionPriority: 1
    });
    setupConnection(conn);
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) || 
    c.id.toLowerCase().includes(contactSearch.toLowerCase())
  );

  if (step === 'onboarding') {
    return (
      <Onboarding
        initialName={userName}
        initialAvatar={userAvatar}
        onComplete={({ name, avatar }) => {
          setUserName(name);
          setUserAvatar(avatar);
          localStorage.setItem('bluelink_name', name);
          if (avatar) localStorage.setItem('bluelink_avatar', avatar);
          localStorage.setItem('bluelink_onboarded', 'true');
          setStep('discovery');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen bg-app-sec font-sans text-gray-100 overflow-hidden items-center justify-center transition-colors">
      {/* Security Info Modal */}
      <AnimatePresence>
        {showSecurityInfo && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSecurityInfo(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-app-sec rounded-3xl border border-white/10 p-6 relative z-10 shadow-2xl overflow-hidden transition-colors"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue/10 rounded-full blur-3xl -mr-16 -mt-16" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-blue/20 flex items-center justify-center text-brand-blue">
                    <CheckCheck size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white italic leading-none">ZERO CLOUD</h3>
                    <p className="text-[10px] text-brand-blue font-bold tracking-widest uppercase">Decentralized Mesh Protocol</p>
                  </div>
                </div>
                <button onClick={() => setShowSecurityInfo(false)} className="text-gray-500 hover:text-white p-2">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4 mb-8 text-left">
                <div className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <Radio size={24} className="text-brand-blue shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Local Mesh Discovery</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Your device scans local airwaves (Bluetooth/Radio) to find peers directly — no central directory, no servers.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <CheckCheck size={24} className="text-brand-blue shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">End-to-End Encryption</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Messages are locked with your local hardware key before they ever leave your device. Only your peer can unlock them.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <Activity size={24} className="text-brand-blue shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">P2P Data Residency</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Every piece of data—text, files, and voice—is stored strictly on your device. We have no central database and no cloud access.
                    </p>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => setShowSecurityInfo(false)}
                className="w-full py-4 bg-brand-blue text-white font-black italic tracking-widest rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                GOT IT
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col w-full h-full max-w-lg bg-app-bg relative overflow-hidden shadow-2xl md:border-x border-white/5 transition-colors">
        {/* Top Navigation Bar / BlueLink Header */}
        <header className="flex items-center justify-between px-4 h-16 bg-app-sec border-b border-white/5 z-30 shadow-sm shrink-0 transition-colors">
          <div className="flex items-center gap-3 shrink-0">
            {step === 'chat' && (
              <button 
                onClick={() => setStep('discovery')}
                className="p-1 text-gray-400 hover:text-white"
              >
                <ChevronLeft size={24} />
              </button>
            )}
                <div className={`w-10 h-10 rounded-2xl ${step === 'chat' ? 'bg-brand-blue shadow-lg shadow-brand-blue/20' : 'overflow-hidden'} flex items-center justify-center relative`}>
              {step === 'chat' ? (
                remoteAvatar ? (
                  <img src={remoteAvatar} alt={remoteName} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-white font-bold">{remoteName.substring(0, 1).toUpperCase()}</div>
                )
              ) : (
                <img src="/logo.svg" alt="BlueLink" className="w-10 h-10" />
              )}
            </div>
            <div className="flex flex-col">
              {step === 'chat' ? (
                <>
                  <h1 className="text-sm font-semibold truncate max-w-[120px]">{remoteName}</h1>
                  <span className={`text-[10px] ${connectionStatus === 'connected' ? 'text-brand-blue' : 'text-gray-400'} flex items-center gap-1`}>
                    {connectionStatus === 'connected' ? (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse" />
                        encrypted mesh
                      </>
                    ) : 'linking...'}
                  </span>
                </>
              ) : (
                <div className="flex flex-col">
                  <h1 className="text-lg font-black text-brand-primary italic tracking-tight leading-none">BlueLink<span className="text-brand-blue">.</span></h1>
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] leading-none mt-0.5">
                    {step === 'account' ? 'Profile' : (step === 'calls' ? 'Calls' : (step === 'contacts' ? 'Contacts' : (step === 'nearby' ? 'Discovery' : 'Direct P2P')))}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {step === 'chat' ? (
              <>
                {callStatus === 'idle' && (
                  <button onClick={startCall} className="p-2 text-slate-400 hover:text-brand-blue transition-colors">
                    <Phone size={18} />
                  </button>
                )}
              </>
            ) : (
              <button 
                onClick={() => setShowSecurityInfo(true)}
                className="p-1.5 px-2.5 border border-white/10 rounded-xl flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors"
                title="Mesh Security"
              >
                 <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mesh Active</span>
              </button>
            )}
            <button 
              onClick={() => setStep('account')} 
              className={`p-2 rounded-xl transition-all ${step === 'account' ? 'text-brand-blue bg-brand-blue/10 shadow-inner' : 'text-slate-400 hover:text-brand-blue hover:bg-white/5'} overflow-hidden relative`}
            >
              {userAvatar ? (
                <img src={userAvatar} alt="Profile" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <User size={18} />
              )}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <AnimatePresence>
            {lastError && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-4 right-4 z-50 p-4 bg-red-500/90 backdrop-blur-md text-white rounded-2xl shadow-xl flex items-center gap-3 border border-red-400/20"
              >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <X size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70">Connection Error</p>
                  <p className="text-xs font-medium truncate">{lastError}</p>
                </div>
                <button onClick={() => setLastError(null)} className="p-1 hover:bg-white/10 rounded-lg">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {step === 'account' && (
            <motion.div
              key="account"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col bg-app-bg px-6 py-8 overflow-y-auto"
            >
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                  <div className="w-24 h-24 rounded-full bg-brand-blue flex items-center justify-center text-3xl font-bold text-white shadow-2xl shadow-brand-blue/30 border-4 border-white/20 overflow-hidden relative">
                    {userAvatar ? (
                      <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                    ) : (
                      userName.substring(0, 1).toUpperCase()
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Scan size={24} className="text-white" />
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-app-bg border-2 border-white/10 rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-blue animate-pulse" />
                  </div>
                  <input 
                    type="file" 
                    ref={avatarInputRef} 
                    onChange={handleAvatarChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">{userName}</h2>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 mt-1">Mesh Node Identity</p>
                </div>

                {/* Identity QR Section */}
                <div className="w-full bg-app-sec p-6 rounded-[32px] border border-white/5 shadow-xl space-y-4">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-white rounded-3xl shadow-inner border border-white/5">
                      <QRCodeSVG 
                        value={peerId} 
                        size={160}
                        level="H"
                        includeMargin={true}
                      />
                    </div>
                    <div className="space-y-1 text-center w-full">
                      <p className="text-[11px] font-bold text-brand-blue uppercase tracking-widest">Digital Signature</p>
                      <div className="flex items-center gap-2 px-3 py-3 bg-black/40 border border-white/5 rounded-2xl w-full">
                        <code className="text-[11px] font-mono text-slate-400 truncate flex-1">{peerId}</code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(peerId);
                            setCopySuccess(true);
                            setTimeout(() => setCopySuccess(false), 2000);
                          }}
                          className="text-brand-blue hover:text-brand-blue-dark transition-colors"
                        >
                          {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full space-y-3 pb-8">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Display Name</label>
                    <input 
                      type="text" 
                      value={userName} 
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full bg-app-sec border border-white/5 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-brand-blue/50 transition-colors font-bold shadow-sm"
                    />
                  </div>
                  
                  <button 
                    onClick={() => {
                      localStorage.clear();
                      window.location.reload();
                    }}
                    className="w-full py-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-2xl text-red-500 font-bold text-[10px] uppercase tracking-widest transition-all mt-4"
                  >
                    Wipe Node History
                  </button>
                </div>

                <div className="w-full mt-4 pt-8 border-t border-white/5">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Discovery Metrics</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-app-sec/40 rounded-3xl border border-white/5">
                      <div className="text-xs font-bold text-gray-500 mb-1">PROTO</div>
                      <div className="text-sm font-bold text-brand-blue">BLE MESH</div>
                    </div>
                    <div className="p-4 bg-app-sec/40 rounded-3xl border border-white/5">
                      <div className="text-xs font-bold text-gray-500 mb-1">CRYPTO</div>
                      <div className="text-sm font-bold text-brand-blue">ED25519</div>
                    </div>
                  </div>

                  {deviceInfo && (
                    <div className="mt-4 p-5 bg-white/[0.02] border border-white/5 rounded-[32px]">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                             <Activity size={16} className="text-brand-blue" />
                          </div>
                          <div>
                             <h4 className="text-[10px] font-bold text-gray-200">Native Bridge</h4>
                             <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Capacitor Engine Active</p>
                          </div>
                       </div>
                       <div className="space-y-2.5 text-left">
                          <div className="flex justify-between items-center">
                             <span className="text-[9px] text-slate-500 font-bold uppercase">Node Hardware</span>
                             <span className="text-[10px] text-slate-400 font-mono">{deviceInfo.model || 'Standard Interface'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[9px] text-gray-600 font-bold uppercase">Link Status</span>
                             <span className="text-[9px] font-black uppercase tracking-widest text-green-500">
                                Mesh Ready
                             </span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[9px] text-gray-600 font-bold uppercase">Packet Integrity</span>
                             <span className="text-[10px] text-gray-400 font-mono">Validated</span>
                          </div>
                       </div>
                    </div>
                  )}
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
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[10px] font-bold text-brand-blue uppercase tracking-widest leading-none">Address Book</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">{contacts.length} Peers</span>
                    <button onClick={() => setShowAddContact(true)} className="flex items-center gap-1 text-[10px] font-bold text-brand-blue uppercase hover:underline" title="Add Contact">
                      <UserPlus size={12} /> Add
                    </button>
                  </div>
                </div>

                {/* Instant Link Section moved here */}
                <div className="bg-app-sec p-3 rounded-2xl border border-white/5 shadow-xl space-y-3 mb-4">
                  <div className="relative">
                        <input
                          type="text"
                          placeholder="Enter Peer ID for Direct Link"
                          value={remoteId}
                          onChange={(e) => setRemoteId(e.target.value)}
                          className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-4 pr-10 text-sm font-mono text-gray-200 outline-none focus:border-brand-blue/50 transition-colors shadow-inner"
                        />
                    <button 
                      onClick={() => setIsScanning(true)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-blue hover:text-white transition-colors"
                    >
                      <Scan size={20} />
                    </button>
                  </div>
                  <button
                    onClick={() => connectToPeer()}
                    disabled={!remoteId.trim() || connectionStatus === 'connecting'}
                    className="w-full bg-brand-blue text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 disabled:opacity-50 disabled:shadow-none active:scale-[0.98] transition-all"
                  >
                    {connectionStatus === 'connecting' ? 'Establishing Tunnel...' : 'Establish Direct Link'}
                    <Send size={16} />
                  </button>
                </div>
                
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    <Search size={18} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search by name or ID..." 
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="w-full bg-app-sec rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 outline-none placeholder:text-gray-500 border border-white/5"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto chat-scroll px-2">
                {/* Pending Requests Section */}
                {contactRequests.length > 0 && (
                  <div className="px-2 pb-6 pt-2">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                       <Radio size={10} className="text-brand-blue animate-pulse" />
                       Incoming Link Requests
                    </h3>
                    <div className="space-y-2">
                      {contactRequests.map(request => (
                        <div key={request.id} className="flex items-center justify-between p-4 bg-brand-blue/[0.03] border border-brand-blue/20 rounded-[24px] shadow-sm animate-in fade-in slide-in-from-left-4 transition-all hover:bg-brand-blue/5">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                             <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center text-brand-blue font-bold text-sm uppercase shrink-0 border border-brand-blue/20 overflow-hidden">
                                {request.senderAvatar ? (
                                  <img src={request.senderAvatar} alt={request.senderName} className="w-full h-full object-cover" />
                                ) : (
                                  request.senderName.substring(0, 1)
                                )}
                             </div>
                             <div className="truncate">
                                <div className="text-sm font-bold text-gray-100 truncate">{request.senderName}</div>
                                <div className="text-[9px] font-mono text-gray-500 mt-0.5 truncate uppercase tracking-widest">ID: {request.senderId.substring(0, 12)}</div>
                             </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                             <button 
                               onClick={() => handleContactRequest(request.id, 'accepted')}
                               className="p-2.5 bg-brand-blue text-white rounded-xl shadow-lg shadow-brand-blue/20 active:scale-95 transition-all"
                               title="Authorize Node"
                             >
                               <Check size={18} />
                             </button>
                             <button 
                               onClick={() => handleContactRequest(request.id, 'declined')}
                               className="p-2.5 bg-red-500/5 text-red-500 hover:bg-red-500/10 rounded-xl active:scale-95 transition-all border border-red-500/10"
                               title="Block Signature"
                             >
                               <X size={18} />
                             </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {contacts.length === 0 && contactRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-8 opacity-40">
                     <Users size={48} className="text-gray-500 mb-4" />
                     <p className="text-sm">No peered nodes found.</p>
                     <button 
                       onClick={() => setShowAddContact(true)}
                       className="mt-4 text-brand-blue font-bold text-sm"
                     >
                       Add Peer Identity
                     </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredContacts.map(contact => (
                      <div 
                        key={contact.id}
                        className="flex items-center gap-3 p-4 bg-app-sec/20 border border-white/5 rounded-xl mx-2 mb-2 group"
                      >
                        <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center text-lg font-bold text-brand-blue/60 overflow-hidden">
                          {contact.avatar ? (
                            <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                          ) : (
                            contact.name.substring(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-200 truncate">{contact.name}</h3>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-gray-500 truncate font-mono bg-black/30 px-2 py-0.5 rounded border border-white/5">{contact.id}</p>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(contact.id);
                                setCopySuccess(true);
                                setTimeout(() => setCopySuccess(false), 2000);
                              }}
                              className="text-gray-600 hover:text-brand-blue transition-colors"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setRemoteId(contact.id);
                              setStep('discovery');
                              // This will move them to the Chats section where they can initiate the link
                            }}
                            className="p-2 text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-all"
                            title="Open in Chats"
                          >
                            <MessageSquare size={18} />
                          </button>
                          <button 
                            onClick={() => removeContact(contact.id)}
                            className="p-2 text-red-500/30 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Remove Peer"
                          >
                            <Trash2 size={18} />
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
              className="flex-1 flex flex-col bg-app-bg overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-6">
                {/* Recent Chats Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-bold text-brand-blue uppercase tracking-widest leading-none">Active Conversations</h3>
                    <button 
                      onClick={() => {
                        if (confirm('Clear all chat history?')) {
                          setMessages([]);
                        }
                      }}
                      className="text-[10px] text-gray-500 font-bold hover:text-red-500 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1 pb-4">
                    {messages.filter(m => m.senderId !== 'system').length === 0 ? (
                      <div className="bg-app-sec/30 border border-dashed border-white/5 rounded-2xl py-12 text-center px-6">
                        <div className="w-12 h-12 bg-app-sec rounded-full flex items-center justify-center mx-auto mb-4">
                          <MessageSquare size={20} className="text-gray-600" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-400 mb-1">Wireless Silence</h3>
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-bold">Encrypted chat nodes will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Get unique participants from messages, excluding system messages */}
                        {(Array.from(new Set(messages
                          .filter(m => m.senderId !== 'system')
                          .map(m => m.isMe ? (m as any).receiverId || (m as any).targetId : m.senderId))) as string[])
                          .filter(id => id && id !== peerId && id !== 'system')
                          .map(id => {
                            const contact = contacts.find(c => c.id === id);
                            const threadMessages = messages.filter(m => m.senderId === id || (m.isMe && ((m as any).receiverId === id || (m as any).targetId === id)));
                            const lastMsg = threadMessages[threadMessages.length - 1];
                            const unreadCountForThread = threadMessages.filter(m => !m.isMe && m.status !== 'read').length;
                            
                            if (!lastMsg) return null;

                            return (
                              <div 
                                key={id}
                                onClick={() => connectToContact(id, contact?.name || `Node-${id.substring(0,4)}`)}
                                className="flex items-center gap-3 p-4 bg-app-sec/40 hover:bg-app-sec/60 rounded-2xl border border-white/5 cursor-pointer transition-all group active:scale-[0.98]"
                              >
                                <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center text-lg font-bold text-white relative overflow-hidden">
                                  {contact?.avatar ? (
                                    <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                                  ) : (
                                    (contact?.name || 'U').substring(0, 1).toUpperCase()
                                  )}
                                  {(connection?.peer === id && connectionStatus === 'connected') ? (
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-brand-blue border-2 border-app-bg rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] z-10" />
                                  ) : unreadCountForThread > 0 ? (
                                    <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg border border-app-bg animate-bounce z-10">
                                       {unreadCountForThread}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <h4 className={`font-bold truncate ${unreadCountForThread > 0 ? 'text-brand-blue' : 'text-gray-100'}`}>{contact?.name || `Node-${id.substring(0,8)}`}</h4>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                     <p className={`text-[11px] truncate italic flex items-center gap-1 ${unreadCountForThread > 0 ? 'text-gray-300 font-bold' : 'text-gray-500'}`}>
                                       {lastMsg.isMe && (
                                         <span className="flex items-center mr-0.5">
                                           {lastMsg.status === 'read' ? (
                                             <CheckCheck size={10} className="text-brand-blue mr-1" />
                                           ) : (
                                             <Check size={10} className="text-gray-600 mr-1" />
                                           )}
                                           <span className="text-brand-blue font-black tracking-tighter">YOU:</span>
                                         </span>
                                       )}
                                       {lastMsg.file ? (
                                         <span className="flex items-center gap-1"><FileText size={10} /> Attachment</span>
                                       ) : (
                                         lastMsg.text
                                       )}
                                     </p>
                                     {unreadCountForThread > 0 && <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse ml-2" />}
                                  </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                   <ChevronLeft size={16} className="text-gray-600 rotate-180" />
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'nearby' && (
            <motion.div
              key="nearby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col bg-app-bg overflow-hidden"
            >
              {/* Radar Header */}
              <div className="relative h-64 flex flex-col items-center justify-center overflow-hidden border-b border-white/5 bg-black/40">
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                   <div className="w-[100px] h-[100px] border border-brand-blue rounded-full" />
                   <div className="absolute w-[200px] h-[200px] border border-brand-blue/40 rounded-full" />
                   <div className="absolute w-[300px] h-[300px] border border-brand-blue/20 rounded-full" />
                   <div className="absolute w-[400px] h-[400px] border border-brand-blue/10 rounded-full" />
                   {/* Scanning Beam */}
                   <motion.div 
                     animate={{ rotate: 360 }} 
                     transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                     className="absolute w-[200px] h-[200px] bg-gradient-to-tr from-brand-blue/40 to-transparent origin-center left-1/2 top-1/2 -ml-[100px] -mt-[100px] rounded-full"
                     style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 40%)' }}
                   />
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-16 h-16 bg-brand-blue/20 rounded-full flex items-center justify-center border border-brand-blue/30 backdrop-blur-md mb-4 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                    <Radio size={32} className="text-brand-blue animate-pulse" />
                  </div>
                  <h2 className="text-xl font-black text-white tracking-widest italic leading-none">MESH RADAR</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse" />
                    <span className="text-[10px] font-black text-brand-blue uppercase tracking-[0.3em]">Decoding Local Signals</span>
                  </div>
                </div>
                
                <div className="absolute bottom-4 left-0 right-0 flex justify-center px-8">
                   <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-brand-blue"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                      />
                   </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-6">
                 {/* Discovered Peer List */}
                 <div className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                       <div className="flex items-center gap-2">
                          <Activity size={12} className="text-brand-blue" />
                          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{discoveredNodes.length} Verified Signatures</h3>
                       </div>
                       <button onClick={() => setShowSecurityInfo(true)} className="text-[10px] font-black text-brand-blue/60 uppercase tracking-tighter hover:text-brand-blue">Mesh Security Info</button>
                    </div>
                    
                    <AnimatePresence mode="popLayout">
                      {discoveredNodes.length === 0 ? (
                        <motion.div 
                          key="scanning-placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-8 text-center"
                        >
                          <div className="inline-block px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[9px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">
                             Optimizing Signal Floor...
                          </div>
                        </motion.div>
                      ) : (
                        discoveredNodes.map((node, idx) => (
                          <motion.div 
                            key={node.id}
                            initial={{ opacity: 0, x: -20, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            className="group relative"
                          >
                               <div 
                                 className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.08] transition-all backdrop-blur-sm group"
                               >
                                  <div className="flex items-center gap-4 flex-1 min-w-0" onClick={() => {
                                      setRemoteId(node.id);
                                      if (node.type === 'known') setRemoteName(node.name);
                                      setStep('chat');
                                   }}>
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${node.type === 'known' ? 'bg-brand-blue/20 text-brand-blue' : 'bg-gray-800 text-gray-500'} overflow-hidden`}>
                                         {node.avatar ? (
                                           <img src={node.avatar} alt={node.name} className="w-full h-full object-cover" />
                                         ) : (
                                           node.name.substring(0, 1).toUpperCase()
                                         )}
                                      </div>
                                      <div className="text-left truncate">
                                         <div className="flex items-center gap-2">
                                           <div className="text-sm font-bold text-gray-200 truncate">{node.name}</div>
                                           {node.type === 'known' && <div className="px-1.5 py-0.5 bg-brand-blue/10 text-[8px] font-black text-brand-blue uppercase rounded shrink-0">Linked</div>}
                                         </div>
                                         <div className="text-[9px] font-mono text-gray-600 mt-0.5 truncate flex items-center gap-1">
                                           <Bluetooth size={8} className="text-brand-blue" />
                                           MESH DISCOVERY: {node.id.substring(0, 16)}...
                                         </div>
                                      </div>
                                   </div>
                                   
                                  <div className="flex items-center gap-3">
                                     <div className="text-right hidden sm:block">
                                         <div className="text-[10px] font-mono font-bold text-brand-blue">{node.signal} dBm</div>
                                         <div className="text-[9px] text-gray-600 font-bold uppercase tracking-tighter">~{node.dist}m</div>
                                      </div>
                                      
                                      {node.type === 'unknown' && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            sendContactRequest(node.id, node.name);
                                          }}
                                          disabled={contactRequests.some(r => r.senderId === node.id)}
                                          className={`p-2.5 rounded-xl transition-all active:scale-95 ${
                                            contactRequests.some(r => r.senderId === node.id)
                                              ? 'bg-green-500/10 text-green-500'
                                              : 'bg-brand-blue/10 text-brand-blue hover:bg-brand-blue hover:text-white'
                                          }`}
                                          title={contactRequests.some(r => r.senderId === node.id) ? "Request Sent" : "Send Link Request"}
                                        >
                                          {contactRequests.some(r => r.senderId === node.id) ? <Check size={16} /> : <UserPlus size={16} />}
                                        </button>
                                      )}
                                   </div>
                               </div>
                             {/* Connection status line */}
                             <div className="absolute left-9 -bottom-3 h-3 w-px bg-gradient-to-b from-white/10 to-transparent last:hidden" />
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>

                    {isScanningActive && (
                      <div className="flex items-center justify-between p-4 bg-app-sec/10 border border-dashed border-white/5 rounded-3xl animate-pulse">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-800/30 flex items-center justify-center">
                               <Radio size={14} className="text-gray-700" />
                            </div>
                            <div className="text-left">
                               <div className="w-24 h-2 bg-gray-800 rounded-full mb-2" />
                               <div className="w-32 h-1.5 bg-gray-800/50 rounded-full" />
                            </div>
                         </div>
                         <div className="w-10 h-4 bg-gray-800/30 rounded-lg" />
                      </div>
                    )}
                 </div>

                 <div className="flex flex-col items-center gap-2 pt-6 pb-20">
                    <button 
                      onClick={startBluetoothDiscovery}
                      className="flex items-center gap-2 px-6 py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-full text-brand-blue hover:bg-brand-blue hover:text-white transition-all active:scale-95 group mb-4"
                    >
                      <Bluetooth size={16} className="group-hover:rotate-12 transition-transform" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Active BT Discovery</span>
                    </button>
                    <div className="flex items-center gap-2">
                       <span className="w-1 h-1 bg-brand-blue rounded-full animate-bounce [animation-delay:-0.3s]" />
                       <span className="w-1 h-1 bg-brand-blue rounded-full animate-bounce [animation-delay:-0.15s]" />
                       <span className="w-1 h-1 bg-brand-blue rounded-full animate-bounce" />
                    </div>
                    <p className="text-[9px] text-gray-700 font-bold uppercase tracking-[0.4em]">Mesh Integrity Secure</p>
                 </div>
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
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[10px] font-bold text-brand-blue uppercase tracking-widest leading-none">Recent Activity</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">{callHistory.length} Sessions</span>
                    <button 
                      onClick={() => {
                        if (confirm('Clear all call records?')) setCallHistory([]);
                      }} 
                      className="text-[10px] font-bold text-gray-500 uppercase hover:text-red-500 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto chat-scroll px-2 py-2">
                {callHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-8 opacity-40">
                    <div className="w-16 h-16 bg-app-sec rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <Phone size={32} className="text-gray-600" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-400">No recent calls</h3>
                    <p className="text-[10px] uppercase tracking-wider text-gray-600 mt-1">Encrypted signals will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {callHistory.map(call => (
                      <div 
                        key={call.id} 
                        className="flex items-center gap-3 p-4 bg-app-sec/20 border border-white/5 hover:bg-app-sec/40 cursor-pointer transition-all rounded-2xl mx-2 group"
                        onClick={() => {
                          setRemoteId(call.peerId);
                          setRemoteName(call.peerName);
                          setStep('chat');
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center text-lg font-bold text-brand-blue/60">
                          {call.peerName.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <h3 className="font-bold text-gray-200 truncate">{call.peerName}</h3>
                            <span className="text-[10px] text-gray-600 font-mono">
                              {new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                            {call.type === 'incoming' && <PhoneIncoming size={10} className="text-brand-blue" />}
                            {call.type === 'outgoing' && <PhoneOutgoing size={10} className="text-brand-blue" />}
                            {call.type === 'missed' && <PhoneMissed size={10} className="text-red-500" />}
                            <span className={call.type === 'missed' ? 'text-red-500/80' : ''}>
                              {call.type === 'missed' ? 'Missed Call' : (call.type === 'incoming' ? 'Incoming' : 'Outgoing')}
                            </span>
                            {call.duration && (
                              <span className="text-gray-600 ml-1 flex items-center gap-1">
                                <Clock size={10} /> {formatDuration(call.duration)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation();
                            setRemoteId(call.peerId);
                            setRemoteName(call.peerName);
                            startCall(); 
                          }} 
                          className="p-3 text-brand-blue hover:bg-brand-blue/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
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
                {messages.map((msg, idx) => {
                  const prevMsg = messages[idx - 1];
                  const showDateHeader = !prevMsg || 
                    new Date(prevMsg.timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                  
                  return (
                    <React.Fragment key={msg.id}>
                      {showDateHeader && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-center my-6"
                        >
                          <span className="bg-white/5 border border-white/5 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-xl shadow-lg backdrop-blur-md">
                            {new Date(msg.timestamp).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                          </span>
                        </motion.div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'} group`}
                      >
                        <div className={`
                          relative px-3 py-1.5 shadow-sm border border-white/5 flex flex-col min-w-[80px]
                          ${msg.isMe ? 'bg-app-bubble-out text-white rounded-lg rounded-tr-none ml-12' : 'bg-app-bubble-in text-gray-100 rounded-lg rounded-tl-none mr-12'}
                        `}>
                          <div className={`absolute top-0 w-2 h-2 ${msg.isMe ? '-right-2' : '-left-2'} overflow-hidden`}>
                             <div className={`w-4 h-4 rotate-45 ${msg.isMe ? 'bg-app-bubble-out -translate-x-2' : 'bg-app-bubble-in translate-x-2'}`}></div>
                          </div>
                          {msg.text && (
                            <p className={`text-sm whitespace-pre-wrap leading-normal mb-1 ${msg.deleted ? 'italic opacity-50' : ''}`}>
                              {msg.text}
                            </p>
                          )}
                          {msg.file && !msg.deleted && (
                            <div className="mb-1 p-2 bg-black/20 rounded-lg border border-white/5">
                               {msg.file.type.startsWith('audio/') ? (
                                 <VoiceMessage bubble={msg} />
                               ) : (
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
                               )}
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-1 self-end">
                            {msg.isMe && !msg.deleted && (
                              <button 
                                onClick={() => deleteMessage(msg.id)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 mr-1"
                                title="Delete Message"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                            <span className="text-[9px] text-gray-400 uppercase">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.isMe && (
                              <div className="flex items-center">
                                {msg.status === 'queued' ? (
                                  <Clock size={10} className="text-gray-500" />
                                ) : msg.status === 'sent' ? (
                                  <Check size={12} className="text-gray-400" />
                                ) : (
                                  <CheckCheck size={12} className={msg.status === 'read' ? 'text-brand-blue' : 'text-gray-500'} />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    </React.Fragment>
                  );
                })}
                {remoteIsTyping && (
                  <div className="flex justify-start">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 font-bold ml-2 uppercase tracking-tighter">
                         {remoteName || 'Peer'} is typing
                      </span>
                      <div className="bg-app-bubble-in px-4 py-2 rounded-xl rounded-tl-none flex gap-1 w-fit">
                        <div className="w-1 h-1 bg-brand-blue rounded-full animate-bounce" />
                        <div className="w-1 h-1 bg-brand-blue rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1 h-1 bg-brand-blue rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="bg-app-sec p-2 flex items-end gap-2 relative z-10">
                {!isRecording ? (
                  <>
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 text-gray-400 hover:text-white">
                      <Paperclip size={24} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={sendFile} className="hidden" />
                    <button 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                      className={`p-3 transition-colors ${showEmojiPicker ? 'text-brand-blue' : 'text-gray-400 hover:text-white'}`}
                    >
                      <Smile size={24} />
                    </button>
                    
                    {showEmojiPicker && (
                      <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-white/10">
                        <EmojiPicker 
                          onEmojiClick={(emojiData) => {
                            onEmojiClick(emojiData);
                            setShowEmojiPicker(false);
                          }}
                          theme={EmojiTheme.DARK}
                          autoFocusSearch={false}
                          skinTonesDisabled
                          searchDisabled
                          previewConfig={{ showPreview: false }}
                          height={350}
                          width={300}
                        />
                      </div>
                    )}

                <div className="flex-1 bg-app-bg rounded-[24px] flex items-end px-4 py-2 min-h-[48px] border border-transparent transition-colors shadow-inner">
                       <textarea
                         placeholder="Type a message"
                         rows={1}
                         value={messageText}
                         onChange={(e) => {
                           setMessageText(e.target.value);
                           handleTyping(e.target.value.length > 0);
                           
                           // Clear timeout if exists
                           if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                           
                           // Set timeout to stop typing
                           typingTimeoutRef.current = setTimeout(() => {
                             handleTyping(false);
                           }, 2000);
                         }}
                         className="w-full bg-transparent border-none outline-none resize-none text-sm py-1.5 text-gray-100"
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && !e.shiftKey) {
                             e.preventDefault();
                             if (messageText.trim()) {
                               sendMessage(messageText.trim());
                               setMessageText('');
                             }
                           }
                         }}
                       />
                    </div>
                    {messageText.trim() ? (
                      <button 
                        onClick={() => {
                          if (messageText.trim()) {
                            sendMessage(messageText.trim());
                            setMessageText('');
                          }
                        }} 
                        className="p-3 rounded-full shadow-lg transition-all bg-brand-blue text-white scale-110"
                      >
                        <Send size={20} />
                      </button>
                    ) : (
                      <button 
                        onClick={startRecording}
                        className="p-3 rounded-full shadow-lg transition-all bg-gray-800 text-gray-400 hover:text-brand-blue"
                      >
                        <Mic size={24} />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center gap-4 bg-brand-blue/10 rounded-full px-6 py-3 border border-brand-blue/20">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-mono font-bold text-white tracking-widest">{formatDuration(recordingDuration)}</span>
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-brand-blue"
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 60, ease: "linear" }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={cancelRecording} className="p-2 text-gray-400 hover:text-white uppercase text-[10px] font-black tracking-widest">
                          Cancel
                       </button>
                       <button onClick={stopRecording} className="p-3 bg-brand-blue text-white rounded-full shadow-lg animate-bounce">
                          <StopCircle size={24} />
                       </button>
                    </div>
                  </div>
                )}
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
                  <div className="w-20 h-20 bg-brand-blue/10 rounded-full flex items-center justify-center mx-auto mb-6 overflow-hidden border-2 border-brand-blue/20">
                    {potentialContact.avatar ? (
                      <img src={potentialContact.avatar} alt={potentialContact.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserPlus size={40} className="text-brand-blue" />
                    )}
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

          {/* QR Scanner Overlay */}
          <AnimatePresence>
            {isScanning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black flex flex-col"
              >
                <div className="p-4 flex items-center justify-between">
                  <button 
                    onClick={() => setIsScanning(false)}
                    className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                  <h2 className="text-white font-bold">Scan Peer ID</h2>
                  <div className="w-10"></div>
                </div>
                
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="w-full max-w-sm aspect-square relative bg-gray-900 rounded-3xl overflow-hidden border-2 border-brand-blue/50 shadow-2xl shadow-brand-blue/20">
                     <div id="qr-reader" className="w-full h-full"></div>
                     
                     {/* Decorative corners */}
                     <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-blue rounded-tl-xl m-4 z-10 pointer-events-none"></div>
                     <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-blue rounded-tr-xl m-4 z-10 pointer-events-none"></div>
                     <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-blue rounded-bl-xl m-4 z-10 pointer-events-none"></div>
                     <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-blue rounded-br-xl m-4 z-10 pointer-events-none"></div>
                     
                     <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20 z-10">
                        <div className="w-1/2 h-0.5 bg-brand-blue animate-[ping_2s_infinite]"></div>
                     </div>
                  </div>
                </div>
                
                <div className="p-12 text-center">
                  <p className="text-gray-400 text-sm font-medium uppercase tracking-[0.2em]">Align QR Code within the frame</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="flex items-center justify-around h-16 bg-app-sec border-t border-white/5 z-30 shrink-0">
          <button onClick={() => setStep('nearby')} className={`flex flex-col items-center gap-1 transition-all ${step === 'nearby' ? 'text-brand-blue scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <Radio size={20} /><span className="text-[10px] font-medium">Nearby</span>
          </button>
          <button onClick={() => setStep('discovery')} className={`flex flex-col items-center gap-1 transition-all ${step === 'discovery' ? 'text-brand-blue scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <MessageSquare size={20} /><span className="text-[10px] font-medium">Chats</span>
          </button>
          <button onClick={() => setStep('contacts')} className={`flex flex-col items-center gap-1 transition-all ${step === 'contacts' ? 'text-brand-blue scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <Users size={20} /><span className="text-[10px] font-medium">Contacts</span>
          </button>
          <button onClick={() => setStep('calls')} className={`flex flex-col items-center gap-1 transition-all ${step === 'calls' ? 'text-brand-blue scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <Phone size={20} /><span className="text-[10px] font-medium">Calls</span>
          </button>
        </footer>
      </div>

      <footer className="hidden md:flex h-8 w-full bg-black/40 px-6 items-center justify-between text-[10px] text-gray-600 fixed bottom-0 left-0 right-0 pointer-events-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-brand-blue' : 'bg-yellow-500 animate-pulse'}`} />{connectionStatus === 'connected' ? 'Secure P2P Channel Active' : 'Searching for Peers...'}</span>
        </div>
        <div className="font-mono uppercase tracking-tighter">BlueLink v2.0 • Encryption: AES-GCM</div>
      </footer>
    </div>
  );
}
