import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Copy, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ConsoleLog {
  id: string;
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: string;
}

export function DevConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Capture console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const addLog = (type: ConsoleLog['type'], ...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const timestamp = new Date().toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + `.${String(Date.now()).slice(-3)}`;

      setLogs(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        type,
        message,
        timestamp
      }]);
    };

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      addLog('log', ...args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      addLog('error', ...args);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      addLog('warn', ...args);
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      addLog('info', ...args);
    };

    // Restore original console methods on cleanup
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleCopyLogs = async () => {
    const logsText = logs.map(log => 
      `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    try {
      await navigator.clipboard.writeText(logsText);
      console.log('✅ Logs copied to clipboard');
    } catch (error) {
      console.error('❌ Failed to copy logs:', error);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    console.log('🗑️ Console cleared');
  };

  const getLogColor = (type: ConsoleLog['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-foreground';
    }
  };

  const getLogBg = (type: ConsoleLog['type']) => {
    switch (type) {
      case 'error':
        return 'bg-red-950/30';
      case 'warn':
        return 'bg-yellow-950/30';
      case 'info':
        return 'bg-blue-950/30';
      default:
        return 'bg-muted/20';
    }
  };

  return (
    <>
      {/* Floating Debug Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-[100] w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Terminal className="w-5 h-5" />
        {logs.length > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold"
          >
            {logs.length > 99 ? '99+' : logs.length}
          </motion.span>
        )}
      </motion.button>

      {/* Console Popup */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[101]"
              onClick={() => setIsOpen(false)}
            />

            {/* Console Panel */}
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-20 right-4 left-4 md:left-auto md:w-[600px] h-[70vh] z-[102] bg-card border-2 border-border rounded-lg shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">Dev Console</h3>
                  <span className="text-xs text-muted-foreground">
                    ({logs.length} {logs.length === 1 ? 'log' : 'logs'})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyLogs}
                    disabled={logs.length === 0}
                    className="h-8 w-8"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearLogs}
                    disabled={logs.length === 0}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Logs Content */}
              <ScrollArea className="flex-1 p-4">
                <div ref={scrollRef} className="space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No console logs yet</p>
                      <p className="text-xs mt-1">Logs will appear here as they are generated</p>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`rounded-md p-3 ${getLogBg(log.type)} border border-border/50`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">
                            {log.timestamp}
                          </span>
                          <span className={`text-[10px] font-bold uppercase shrink-0 mt-0.5 ${getLogColor(log.type)}`}>
                            [{log.type}]
                          </span>
                        </div>
                        <pre className={`text-xs mt-1 font-mono whitespace-pre-wrap break-words ${getLogColor(log.type)}`}>
                          {log.message}
                        </pre>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Footer */}
              <div className="p-2 border-t border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground text-center">
                  iOS Debug Console • io.tivly.se only
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
