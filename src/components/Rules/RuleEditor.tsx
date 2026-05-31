import { useState } from 'react';
import { RuleLibraryView } from './RuleLibraryView';
import { MyRules } from './MyRules';
import { useRulesStore } from '../../store/rules';

type Tab = 'library' | 'my-rules';

export function RuleEditor() {
  const [tab, setTab] = useState<Tab>('library');
  const ruleCount = useRulesStore((s) => s.rules.length);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-slate-800 flex-shrink-0">
        <button
          onClick={() => setTab('library')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'library'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-slate-500'
          }`}
        >
          Rule Library
        </button>
        <button
          onClick={() => setTab('my-rules')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'my-rules'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-slate-500'
          }`}
        >
          My Rules
          {ruleCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-700 text-white text-[10px] font-semibold">
              {ruleCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'library' ? <RuleLibraryView /> : <MyRules />}
      </div>
    </div>
  );
}
