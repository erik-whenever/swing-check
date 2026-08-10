import { useState } from 'react';
import { RuleLibraryView } from './RuleLibraryView';
import { MyRules } from './MyRules';
import { useRulesStore } from '../../store/rules';
import { useT } from '../../lib/i18n';
import { Segmented } from '../ui';

type Tab = 'library' | 'my-rules';

export function RuleEditor() {
  const t = useT();
  const ruleCount = useRulesStore((s) => s.rules.length);
  // Someone who already has rules has a reason to open this screen; someone with
  // none has nothing to look at under "my rules". The default follows that.
  const [tab, setTab] = useState<Tab>(ruleCount > 0 ? 'my-rules' : 'library');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[18px] pt-2 pb-3">
        <h2 className="text-base font-semibold">{t('nav.rules')}</h2>
        <div className="mt-3">
          <Segmented
            full
            value={tab}
            onChange={setTab}
            options={[
              {
                value: 'my-rules',
                label: `${t('rules.tab.mine')}${ruleCount > 0 ? ` (${ruleCount})` : ''}`,
              },
              { value: 'library', label: t('rules.tab.library') },
            ]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'library' ? <RuleLibraryView /> : <MyRules />}
      </div>
    </div>
  );
}
