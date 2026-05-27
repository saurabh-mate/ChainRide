import React, { useEffect, useState } from 'react';
import { animate } from 'framer-motion';

const CountUp = ({ to = 0, duration = 1.5, delay = 0 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const safeTarget = Number(to) || 0;
    const timeout = setTimeout(() => {
      const controls = animate(0, safeTarget, {
        duration,
        ease: 'easeOut',
        onUpdate: (v) => setDisplay(Math.round(v)),
      });
      return () => controls.stop();
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [to, duration, delay]);

  return <span>{display}</span>;
};

export default CountUp;
