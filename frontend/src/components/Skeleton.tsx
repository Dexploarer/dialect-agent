import { motion } from 'framer-motion';

export default function Skeleton({ className = '' }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0.4 }}
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 1.2, repeat: Infinity }}
      className={`bg-gray-200 dark:bg-gray-700 rounded-md ${className}`}
    />
  );
}

