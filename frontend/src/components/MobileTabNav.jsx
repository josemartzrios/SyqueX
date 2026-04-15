// frontend/src/components/MobileTabNav.jsx
export default function MobileTabNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'dictar',    label: 'Dictar' },
    { id: 'nota',      label: 'Nota' },
    { id: 'evolucion', label: 'Evolución' },
  ];

  return (
    <div className="flex border-b border-ink/[0.10] bg-white flex-shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-[13px] font-medium border-b-2 transition-all ${
            activeTab === tab.id
              ? 'text-sage border-sage font-semibold'
              : 'text-ink-muted border-transparent'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
