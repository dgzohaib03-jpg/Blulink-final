export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId?: string;
  text?: string;
  timestamp: number;
  isMe: boolean;
  status?: 'sent' | 'delivered' | 'read' | 'queued';
  file?: {
    name: string;
    size: number;
    type: string;
    data: ArrayBuffer | string; // Can be ArrayBuffer or data URL
    url?: string; // Locally generated object URL for downloading
  };
}

export interface Contact {
  id: string;
  name: string;
  addedAt: number;
}

export interface ContactRequest {
  id: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined';
}

export interface CallRecord {
  id: string;
  peerId: string;
  peerName: string;
  timestamp: number;
  type: 'incoming' | 'outgoing' | 'missed';
  duration?: number;
}

export interface PeerData {
  type: 'chat' | 'system' | 'typing' | 'receipt' | 'key-exchange';
  payload: any;
}

export interface ChatState {
  connected: boolean;
  messages: Message[];
  peerId: string | null;
  remotePeerId: string | null;
  remotePeerName: string | null;
  isTyping: boolean;
}
