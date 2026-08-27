import { motion } from 'framer-motion';

export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg">
      <div className="relative flex flex-col items-center">
        <motion.h1 
          className="text-3xl md:text-4xl font-bold tracking-widest text-brand-gold uppercase"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          Barber Manager
        </motion.h1>
        <motion.div 
          className="h-[2px] bg-brand-gold mt-4"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '100%', opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
