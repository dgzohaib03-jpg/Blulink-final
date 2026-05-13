/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio,
  Lock,
  CheckCheck,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  User,
  Camera,
  Sparkles,
  ServerOff,
  KeyRound,
  Zap,
} from 'lucide-react';

type OnboardingProps = {
  initialName: string;
  initialAvatar: string;
  onComplete: (profile: { name: string; avatar: string }) => void;
};

type Slide = {
  id: 'welcome' | 'mesh' | 'crypto' | 'profile';
  badge: string;
  title: React.ReactNode;
  description: string;
  visual: React.ReactNode;
};

// --- Animated Visuals ---------------------------------------------------------

function WelcomeVisual() {
  return (
    <div
      data-testid="onboarding-visual-welcome"
      className="relative w-56 h-56 flex items-center justify-center"
    >
      {/* Pulsing rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-3xl border border-brand-blue/40"
          initial={{ scale: 0.6, opacity: 0.8 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            delay: i * 0.7,
            ease: 'easeOut',
          }}
        />
      ))}
      <motion.img
        src="/logo.svg"
        alt="BlueLink"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-40 h-40 rounded-[2rem] shadow-[0_0_60px_rgba(129,140,248,0.45)]"
      />
    </div>
  );
}

function MeshVisual() {
  const nodes = [
    { x: 0, y: -70 },
    { x: 65, y: -25 },
    { x: 45, y: 60 },
    { x: -45, y: 60 },
    { x: -65, y: -25 },
  ];
  return (
    <div
      data-testid="onboarding-visual-mesh"
      className="relative w-56 h-56 flex items-center justify-center"
    >
      {/* Connection lines */}
      <svg
        viewBox="-100 -100 200 200"
        className="absolute inset-0 w-full h-full"
        style={{ filter: 'drop-shadow(0 0 6px rgba(129,140,248,0.5))' }}
      >
        {nodes.map((n, i) => (
          <motion.line
            key={i}
            x1={0}
            y1={0}
            x2={n.x}
            y2={n.y}
            stroke="rgba(129,140,248,0.6)"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15 * i }}
          />
        ))}
      </svg>

      {/* Center node */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-16 h-16 rounded-full bg-brand-blue flex items-center justify-center shadow-[0_0_30px_rgba(129,140,248,0.6)]"
      >
        <User size={26} className="text-white" />
      </motion.div>

      {/* Peer nodes */}
      {nodes.map((n, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(${n.x}px - 50%), calc(${n.y}px - 50%))`,
          }}
          className="w-9 h-9 rounded-full bg-app-sec border border-brand-blue/60 flex items-center justify-center shadow-lg"
        >
          <Radio size={14} className="text-brand-blue" />
        </motion.div>
      ))}
    </div>
  );
}

function CryptoVisual() {
  return (
    <div
      data-testid="onboarding-visual-crypto"
      className="relative w-56 h-56 flex items-center justify-center"
    >
      {/* Rotating ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-4 rounded-full border border-dashed border-brand-blue/40"
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-10 rounded-full border border-brand-blue/30"
      />

      {/* Floating glyphs */}
      {[
        { Icon: KeyRound, x: -75, y: -30, delay: 0 },
        { Icon: ShieldCheck, x: 70, y: -55, delay: 0.4 },
        { Icon: ServerOff, x: 70, y: 55, delay: 0.8 },
        { Icon: Zap, x: -70, y: 50, delay: 1.2 },
      ].map(({ Icon, x, y, delay }, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: y + 20 }}
          animate={{ opacity: 1, y }}
          transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
          style={{
            position: 'absolute',
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay,
              ease: 'easeInOut',
            }}
            className="w-9 h-9 rounded-xl bg-app-sec/80 border border-brand-blue/30 flex items-center justify-center backdrop-blur-sm"
          >
            <Icon size={16} className="text-brand-blue" />
          </motion.div>
        </motion.div>
      ))}

      {/* Center lock */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-blue/30 to-brand-blue-dark/40 border border-brand-blue/40 flex items-center justify-center shadow-[0_0_40px_rgba(129,140,248,0.35)]"
      >
        <Lock size={36} className="text-brand-blue" />
      </motion.div>
    </div>
  );
}

// --- Profile slide ------------------------------------------------------------

function ProfileSlide({
  name,
  setName,
  avatar,
  setAvatar,
}: {
  name: string;
  setName: (v: string) => void;
  avatar: string;
  setAvatar: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-6">
      <motion.button
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => fileRef.current?.click()}
        data-testid="onboarding-avatar-button"
        className="relative w-28 h-28 rounded-3xl bg-gradient-to-br from-brand-blue/20 to-brand-blue-dark/20 border border-brand-blue/40 flex items-center justify-center overflow-hidden shadow-[0_0_30px_rgba(129,140,248,0.25)]"
      >
        {avatar ? (
          <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <User size={42} className="text-brand-blue" />
        )}
        <div className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center shadow-md">
          <Camera size={14} className="text-white" />
        </div>
      </motion.button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatar}
        data-testid="onboarding-avatar-input"
      />

      <div className="w-full">
        <label className="block text-[10px] font-bold text-brand-blue uppercase tracking-[0.25em] mb-2 px-1">
          Display Name
        </label>
        <input
          type="text"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sky Falcon"
          data-testid="onboarding-name-input"
          className="w-full px-5 py-4 rounded-2xl bg-app-sec border border-white/10 text-white text-base placeholder:text-gray-600 focus:outline-none focus:border-brand-blue/60 focus:shadow-[0_0_0_4px_rgba(129,140,248,0.12)] transition-all"
        />
        <p className="mt-2 px-1 text-[11px] text-gray-500">
          Visible only to peers you connect with. You can change it later.
        </p>
      </div>
    </div>
  );
}

// --- Main Onboarding ----------------------------------------------------------

export default function Onboarding({
  initialName,
  initialAvatar,
  onComplete,
}: OnboardingProps) {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);

  const slides: Slide[] = [
    {
      id: 'welcome',
      badge: 'WELCOME ABOARD',
      title: (
        <>
          Talk off-grid with{' '}
          <span className="italic text-brand-blue">BlueLink</span>
        </>
      ),
      description:
        'A peer-to-peer mesh chat that works without cell towers, Wi-Fi routers, or cloud servers. Just you, your peers, and the radio.',
      visual: <WelcomeVisual />,
    },
    {
      id: 'mesh',
      badge: 'PROXIMITY MESH',
      title: (
        <>
          Discover nearby nodes through{' '}
          <span className="italic text-brand-blue">Bluetooth & WebRTC</span>
        </>
      ),
      description:
        'Your device broadcasts a low-power Bluetooth beacon and links directly to peers in range using encrypted WebRTC tunnels.',
      visual: <MeshVisual />,
    },
    {
      id: 'crypto',
      badge: 'ZERO CLOUD',
      title: (
        <>
          Every message is{' '}
          <span className="italic text-brand-blue">end-to-end encrypted</span>
        </>
      ),
      description:
        'Keys are generated on your device. No servers store your conversations — they live and die between you and the peer you trust.',
      visual: <CryptoVisual />,
    },
    {
      id: 'profile',
      badge: 'SET UP YOUR NODE',
      title: (
        <>
          Pick a <span className="italic text-brand-blue">display name</span>
        </>
      ),
      description:
        'This is how nearby nodes will see you in the mesh. An avatar is optional but makes you easier to spot.',
      visual: null,
    },
  ];

  const current = slides[index];
  const isLast = index === slides.length - 1;
  const isFirst = index === 0;
  const canContinue = isLast ? name.trim().length > 0 : true;

  const goNext = () => {
    if (isLast) {
      onComplete({
        name: name.trim() || `Node-${Math.floor(Math.random() * 9000) + 1000}`,
        avatar,
      });
      return;
    }
    setIndex((i) => Math.min(slides.length - 1, i + 1));
  };

  const goBack = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  const skip = () => setIndex(slides.length - 1);

  return (
    <div
      data-testid="onboarding-screen"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-app-bg text-white overflow-hidden"
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 w-80 h-80 bg-brand-blue/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -right-24 w-96 h-96 bg-brand-blue-dark/20 rounded-full blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative w-full h-full max-w-lg mx-auto flex flex-col px-6 pt-8 pb-6 md:border-x border-white/5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt="BlueLink"
              className="w-9 h-9 rounded-xl shadow-[0_0_18px_rgba(129,140,248,0.35)]"
            />
            <span className="text-[11px] font-black tracking-[0.3em] text-white/80 uppercase">
              BlueLink Mesh
            </span>
          </div>
          {!isLast && (
            <button
              data-testid="onboarding-skip-button"
              onClick={skip}
              className="text-[11px] font-bold tracking-widest text-gray-500 hover:text-brand-blue transition-colors uppercase"
            >
              Skip
            </button>
          )}
        </div>

        {/* Visual area */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full flex flex-col items-center"
            >
              {current.visual && (
                <div className="mb-8">{current.visual}</div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={12} className="text-brand-blue" />
                <span className="text-[10px] font-black tracking-[0.3em] text-brand-blue uppercase">
                  {current.badge}
                </span>
              </div>

              <h1
                data-testid={`onboarding-title-${current.id}`}
                className="text-3xl md:text-[34px] leading-tight font-black text-white text-center max-w-md tracking-tight"
              >
                {current.title}
              </h1>

              <p className="mt-4 text-sm text-gray-400 text-center max-w-sm leading-relaxed">
                {current.description}
              </p>

              {current.id === 'profile' && (
                <div className="mt-10 w-full">
                  <ProfileSlide
                    name={name}
                    setName={setName}
                    avatar={avatar}
                    setAvatar={setAvatar}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Pagination dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {slides.map((s, i) => (
            <button
              key={s.id}
              data-testid={`onboarding-dot-${i}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index
                  ? 'w-8 bg-brand-blue shadow-[0_0_8px_rgba(129,140,248,0.6)]'
                  : 'w-1.5 bg-white/15 hover:bg-white/30'
              }`}
            />
          ))}
        </div>

        {/* Nav controls */}
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: isFirst ? 1 : 1.02 }}
            whileTap={{ scale: isFirst ? 1 : 0.96 }}
            data-testid="onboarding-back-button"
            onClick={goBack}
            disabled={isFirst}
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-all ${
              isFirst
                ? 'border-white/5 text-gray-700 cursor-not-allowed'
                : 'border-white/10 text-gray-300 hover:border-brand-blue/50 hover:text-white'
            }`}
          >
            <ChevronLeft size={22} />
          </motion.button>

          <motion.button
            whileHover={{ scale: canContinue ? 1.02 : 1 }}
            whileTap={{ scale: canContinue ? 0.97 : 1 }}
            data-testid="onboarding-next-button"
            onClick={goNext}
            disabled={!canContinue}
            className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 font-black tracking-[0.2em] uppercase text-sm transition-all ${
              canContinue
                ? 'bg-brand-blue text-white shadow-[0_0_30px_rgba(129,140,248,0.45)] hover:shadow-[0_0_42px_rgba(129,140,248,0.6)]'
                : 'bg-white/5 text-gray-600 cursor-not-allowed'
            }`}
          >
            {isLast ? (
              <>
                <CheckCheck size={18} />
                <span>Enter the Mesh</span>
              </>
            ) : (
              <>
                <span>Continue</span>
                <ChevronRight size={18} />
              </>
            )}
          </motion.button>
        </div>

        <p className="mt-4 text-center text-[10px] text-gray-600 tracking-widest uppercase">
          BlueLink v2.0 · Encryption AES-GCM · No accounts required
        </p>
      </div>
    </div>
  );
}
