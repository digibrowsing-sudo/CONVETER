import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface ToolCardProps {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
}

export default function ToolCard({ to, title, description, icon }: ToolCardProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-500">{description}</p>
    </Link>
  );
}
