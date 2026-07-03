interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Base surface card: white, rounded-2xl, soft shadow, no border. */
export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-2xl shadow-soft ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
