import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Sparkles, Mic, BookOpen, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { motion } from 'framer-motion';

export default function SubscribeSuccess() {
  const navigate = useNavigate();
  const { refreshPlan, userPlan } = useSubscription();
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Refresh the plan after successful subscription
    const refresh = async () => {
      await refreshPlan();
    };
    refresh();

    // Hide confetti after animation
    setTimeout(() => setShowConfetti(false), 5000);
  }, [refreshPlan]);

  const features = [
    { icon: Mic, text: 'Obegränsade inspelningar', color: 'text-primary' },
    { icon: BookOpen, text: 'AI-genererade protokoll', color: 'text-blue-500' },
    { icon: Zap, text: 'Snabb transkribering', color: 'text-yellow-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {showConfetti && [...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{ 
              top: '-10%', 
              left: `${Math.random() * 100}%`,
              rotate: 0,
              opacity: 1
            }}
            animate={{ 
              top: '110%', 
              rotate: 360,
              opacity: 0
            }}
            transition={{ 
              duration: 3 + Math.random() * 2, 
              delay: Math.random() * 0.5,
              ease: 'easeOut'
            }}
          >
            <Sparkles className={`w-6 h-6 ${['text-primary', 'text-blue-500', 'text-yellow-500', 'text-green-500'][i % 4]}`} />
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl w-full text-center space-y-8 relative z-10"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            type: 'spring', 
            stiffness: 200, 
            damping: 15,
            delay: 0.2 
          }}
        >
          <div className="relative inline-block">
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="absolute inset-0 bg-green-500/20 rounded-full blur-xl"
            />
            <CheckCircle className="h-24 w-24 text-green-500 relative" strokeWidth={2} />
          </div>
        </motion.div>

        {/* Thank You Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-foreground">
            Tack för ditt köp! 🎉
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-medium">
            Välkommen till Tivly {userPlan?.plan === 'pro' ? 'Pro' : userPlan?.plan === 'plus' ? 'Plus' : ''}!
          </p>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Din betalning har genomförts och din prenumeration är nu aktiv. Du kan börja använda alla funktioner direkt.
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + index * 0.1 }}
              className="bg-card border border-border rounded-lg p-6 space-y-3 hover:shadow-lg transition-shadow"
            >
              <feature.icon className={`h-8 w-8 ${feature.color} mx-auto`} />
              <p className="text-sm font-medium text-foreground">{feature.text}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="space-y-3 pt-8"
        >
          <Button
            onClick={() => navigate('/')}
            className="w-full md:w-auto px-8"
            size="lg"
          >
            <Mic className="w-5 h-5 mr-2" />
            Börja spela in möte
          </Button>
          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate('/library')}
              variant="outline"
              size="lg"
            >
              <BookOpen className="w-5 h-5 mr-2" />
              Gå till bibliotek
            </Button>
            <Button
              onClick={() => navigate('/agendas')}
              variant="outline"
              size="lg"
            >
              Skapa dagordning
            </Button>
          </div>
        </motion.div>

        {/* Additional Info */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-sm text-muted-foreground pt-4"
        >
          Ett kvitto har skickats till din e-post
        </motion.p>
      </motion.div>
    </div>
  );
}