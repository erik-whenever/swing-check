import { useState } from 'react';
import { useRulesStore } from '../../store/rules';
import { useSessionStore } from '../../store/session';
import { useSettingsStore } from '../../store/settings';
import { RuleBadge } from './RuleBadge';
import { AngleTags, AngleFormPicker } from './AngleTags';
import { ruleMatchesAngle, CAMERA_ANGLES } from '../../lib/cameraAngle';
import type { CameraAngle } from '../../lib/cameraAngle';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { PHASES } from '../../types';
import type { Rule } from '../../types';
import { Button, Card, Chip, Toggle } from '../ui';

const FIELD =
  'w-full px-3.5 py-2.5 bg-raised rounded-chip text-sm text-fg placeholder:text-faint ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/50 transition-shadow';

export function MyRules() {
  const t = useT();
  const rules = useRulesStore((s) => s.rules);
  const toggleRule = useRulesStore((s) => s.toggleRule);
  const removeRule = useRulesStore((s) => s.removeRule);
  const soloRule = useRulesStore((s) => s.soloRule);
  const addRule = useRulesStore((s) => s.addRule);
  const focusRuleId = useSessionStore((s) => s.focusRuleId);
  const setFocusRuleId = useSessionStore((s) => s.setFocusRuleId);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);

  const [showForm, setShowForm] = useState(false);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<Rule['phase']>('backswing');
  const [angles, setAngles] = useState<CameraAngle[]>([...CAMERA_ANGLES]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    addRule({
      title: title.trim(),
      description: description.trim(),
      phase,
      weight: 2,
      angles: angles.length > 0 ? angles : [...CAMERA_ANGLES],
    });
    setTitle('');
    setDescription('');
    setAngles([...CAMERA_ANGLES]);
    setShowForm(false);
  };

  const visible = rules.filter((rule) => ruleMatchesAngle(rule, cameraAngle));

  return (
    <div className="px-[18px] pb-6 space-y-2">
      {visible.length === 0 && !showForm && (
        <p className="text-sm text-muted text-center py-10 px-6 leading-relaxed">
          {t('rules.empty')}
        </p>
      )}

      {visible.map((rule) => {
        const isFocus = focusRuleId === rule.id;
        const actionsOpen = openActions === rule.id;

        return (
          <Card
            key={rule.id}
            tone={isFocus ? 'focus' : rule.active ? 'default' : 'muted'}
            className="animate-rise-in"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-semibold leading-snug flex-1">{rule.title}</p>
              {/* The star IS the control. A focus rule is a single choice, so it needs
                  a single tap — not a button labelled "Focus" among three others. */}
              <button
                onClick={() => setFocusRuleId(isFocus ? null : rule.id)}
                aria-pressed={isFocus}
                aria-label={t('rules.focus')}
                className={`flex-none -mt-0.5 -mr-0.5 px-1 py-0.5 rounded-pill text-[9px]
                            font-bold tracking-[0.06em] transition-colors ${
                              isFocus ? 'text-gold' : 'text-faint hover:text-gold'
                            }`}
              >
                {isFocus ? `★ ${t('rules.focus').toUpperCase()}` : '☆'}
              </button>
            </div>

            <p className="mt-1 text-[10.5px] leading-[1.45] text-muted">{rule.description}</p>

            <div className="flex items-center gap-1.5 mt-2.5">
              <RuleBadge phase={rule.phase} />
              <AngleTags angles={rule.angles} active={cameraAngle} />
              {rule.drills && rule.drills.length > 0 && (
                <Chip tone="outline">{t('rules.drillCount', { count: rule.drills.length })}</Chip>
              )}
              <span className="flex-1" />
              <button
                onClick={() => setOpenActions(actionsOpen ? null : rule.id)}
                aria-label={t('rules.more')}
                aria-expanded={actionsOpen}
                className={`px-1.5 leading-none text-base rounded-pill transition-colors ${
                  actionsOpen ? 'text-fg bg-raised' : 'text-faint hover:text-fg'
                }`}
              >
                ⋯
              </button>
              <Toggle
                size="sm"
                on={rule.active}
                onClick={() => toggleRule(rule.id)}
                label={rule.title}
              />
            </div>

            {/* Solo and delete sit one tap deeper: they are rare, and one of them is
                destructive, so neither belongs in the resting state of every card. */}
            {actionsOpen && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                <Button size="sm" variant="secondary" onClick={() => soloRule(rule.id)}>
                  {t('rules.solo')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="ml-auto"
                  onClick={() => removeRule(rule.id)}
                >
                  {t('rules.delete')}
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Custom rule form */}
      {showForm ? (
        <Card className="animate-rise-in">
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <input
              type="text"
              placeholder={t('rules.form.title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={FIELD}
            />
            <textarea
              placeholder={t('rules.form.desc')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${FIELD} resize-none`}
            />
            {/* Phase as chips, not a <select>: six options fit on two rows, and a
                native picker on iOS hides the choice behind a modal wheel. */}
            <div>
              <p className="eyebrow text-muted mb-1.5">{t('rules.form.phase')}</p>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPhase(p)}
                    aria-pressed={phase === p}
                    className={`rounded-pill px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                      phase === p
                        ? 'bg-accent text-on-accent'
                        : 'bg-raised text-muted hover:text-fg'
                    }`}
                  >
                    {t(`phase.${p}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
            <AngleFormPicker angles={angles} onChange={setAngles} />
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="secondary" full onClick={() => setShowForm(false)}>
                {t('rules.form.cancel')}
              </Button>
              <Button type="submit" full disabled={!title.trim() || !description.trim()}>
                {t('rules.form.save')}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="dashed" size="lg" full className="mt-2" onClick={() => setShowForm(true)}>
          {t('rules.create')}
        </Button>
      )}
    </div>
  );
}
