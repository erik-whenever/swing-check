import { useState } from 'react';
import { useRulesStore } from '../../store/rules';
import { useSessionStore } from '../../store/session';
import { useSettingsStore } from '../../store/settings';
import { RuleBadge } from './RuleBadge';
import { AngleTags, AngleFormPicker } from './AngleTags';
import { ruleMatchesAngle, CAMERA_ANGLES } from '../../lib/cameraAngle';
import type { CameraAngle } from '../../lib/cameraAngle';
import { PHASES } from '../../types';
import type { Rule } from '../../types';

export function MyRules() {
  const rules = useRulesStore((s) => s.rules);
  const toggleRule = useRulesStore((s) => s.toggleRule);
  const removeRule = useRulesStore((s) => s.removeRule);
  const soloRule = useRulesStore((s) => s.soloRule);
  const addRule = useRulesStore((s) => s.addRule);
  const focusRuleId = useSessionStore((s) => s.focusRuleId);
  const setFocusRuleId = useSessionStore((s) => s.setFocusRuleId);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);

  const [showForm, setShowForm] = useState(false);
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

  return (
    <div className="p-4 space-y-3">
      {rules.length === 0 && !showForm && (
        <p className="text-sm text-slate-500 text-center py-8">
          No rules added yet. Browse the Rule Library or add a custom rule.
        </p>
      )}

      {rules
        .filter((rule) => ruleMatchesAngle(rule, cameraAngle))
        .map((rule) => (
        <div
          key={rule.id}
          className={`p-3 rounded-lg border text-left transition-colors ${
            rule.active
              ? 'bg-slate-800 border-slate-700'
              : 'bg-slate-800/50 border-slate-700/50 opacity-60'
          } ${
            focusRuleId === rule.id ? 'ring-2 ring-emerald-500' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-sm font-medium truncate">{rule.title}</span>
                <RuleBadge phase={rule.phase} />
                <AngleTags angles={rule.angles} active={cameraAngle} />
                {rule.libraryId && (
                  <span className="text-[10px] text-slate-600">LIB</span>
                )}
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">
                {rule.description}
              </p>
            </div>
          </div>

          {/* Drill info for library rules */}
          {rule.drills && rule.drills.length > 0 && (
            <div className="mt-1.5 text-[11px] text-emerald-600">
              {rule.drills.length} drill{rule.drills.length > 1 ? 's' : ''} available
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={() => setFocusRuleId(focusRuleId === rule.id ? null : rule.id)}
              className={`px-2 py-1 rounded text-[11px] ${
                focusRuleId === rule.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Set as focus rule"
            >
              Focus
            </button>
            <button
              onClick={() => soloRule(rule.id)}
              className="px-2 py-1 rounded text-[11px] bg-slate-700 text-slate-400 hover:text-amber-300"
              title="Solo — deactivate all other rules"
            >
              Solo
            </button>
            <button
              onClick={() => toggleRule(rule.id)}
              className={`px-2 py-1 rounded text-[11px] ${
                rule.active
                  ? 'bg-emerald-700/30 text-emerald-400'
                  : 'bg-slate-700 text-slate-500'
              }`}
            >
              {rule.active ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => removeRule(rule.id)}
              className="px-2 py-1 rounded text-[11px] bg-slate-700 text-red-400 hover:text-red-300 ml-auto"
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {/* Custom rule form */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
          <input
            type="text"
            placeholder="Rule title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm
                       placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
          />
          <textarea
            placeholder="What to check..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm
                       placeholder:text-slate-500 focus:outline-none focus:border-emerald-600 resize-none"
          />
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as Rule['phase'])}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm
                       focus:outline-none focus:border-emerald-600"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <AngleFormPicker angles={angles} onChange={setAngles} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !description.trim()}
              className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-medium
                         disabled:opacity-30 transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 border border-dashed border-slate-700 rounded-lg text-sm text-slate-500
                     hover:border-slate-500 hover:text-slate-300 transition-colors"
        >
          + Add Custom Rule
        </button>
      )}
    </div>
  );
}
