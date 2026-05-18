export default function BottomNav({ activeSection, onSectionChange }) {
  const tabs = [
    {
      id: 'patients',
      label: 'Pacientes',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      id: 'agenda',
      label: 'Agenda',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex border-t border-ink/[0.07] bg-white flex-shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSectionChange(tab.id)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
            activeSection === tab.id
              ? 'text-[#5a9e8a]'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
