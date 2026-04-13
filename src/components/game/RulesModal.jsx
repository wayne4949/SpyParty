import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, MessageCircle, Vote } from 'lucide-react';
import { useLang } from '@/lib/LangContext';

const ruleIcons = [Eye, MessageCircle, Vote];

export default function RulesModal({ show, onClose }) {
  const { t } = useLang();
  const rules = [t.rule1, t.rule2, t.rule3];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm bg-card border border-border rounded-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t.rulesTitle}</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              {rules.map((text, i) => {
                const Icon = ruleIcons[i];
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{i + 1}. {text}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}