import { useState } from 'react';
import { User, Key, CreditCard, Save, CheckCircle2, Eye, EyeOff, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-5 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const MOCK_API_KEY = 'enzml_sk_live_a8f3c2d9e1b7f4a2c6e8d0f1b3a5c7e9';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    institution: user?.institution || '',
    role: user?.role || 'Scientist',
  });
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const set = (field) => (e) => setProfile(p => ({ ...p, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    await updateUser({ name: profile.name, institution: profile.institution });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const copyKey = () => {
    navigator.clipboard.writeText(MOCK_API_KEY).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Profile */}
      <Section title="Profile" icon={User}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
              {profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{profile.name || 'Your Name'}</div>
              <div className="text-sm text-gray-500">{profile.role} · {profile.institution || 'Institution not set'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
              <input type="text" value={profile.name} onChange={set('name')}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Dr. Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={profile.email} readOnly
                className="w-full px-3.5 py-2.5 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Institution</label>
              <input type="text" value={profile.institution} onChange={set('institution')}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="University or Company" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account role</label>
              <div className="px-3.5 py-2.5 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500">
                {user?.role?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || 'External Customer'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {saved && (
              <div className="flex items-center gap-1.5 text-green-600 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Changes saved
              </div>
            )}
            <button type="submit"
              className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <Save className="w-4 h-4" />
              Save changes
            </button>
          </div>
        </form>
      </Section>

      {/* API Keys */}
      <Section title="API Keys" icon={Key}>
        <p className="text-sm text-gray-500 mb-4">Use your API key to access the EnzymeML REST API from your own scripts and pipelines.</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
          <code className="flex-1 text-sm font-mono text-gray-700">
            {showKey ? MOCK_API_KEY : '•'.repeat(MOCK_API_KEY.length)}
          </code>
          <button onClick={() => setShowKey(!showKey)} className="text-gray-400 hover:text-gray-600 p-1">
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button onClick={copyKey} className="text-gray-400 hover:text-gray-600 p-1">
            {keyCopied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Keep this key secret. Do not share it in public repositories.</p>
        <button className="mt-3 text-sm text-red-500 hover:text-red-600 font-medium">Regenerate key</button>
      </Section>

      {/* Subscription */}
      <Section title="Subscription" icon={CreditCard}>
        {/* Current tier banner */}
        <div className={`flex items-center justify-between p-4 rounded-xl mb-5 border ${
          user?.tier === 'GOLD' ? 'bg-yellow-50 border-yellow-200' :
          user?.tier === 'SILVER' ? 'bg-slate-50 border-slate-200' :
          'bg-orange-50 border-orange-200'
        }`}>
          <div>
            <div className={`font-semibold ${
              user?.tier === 'GOLD' ? 'text-yellow-900' :
              user?.tier === 'SILVER' ? 'text-slate-700' : 'text-orange-900'
            }`}>{user?.tier || 'BRONZE'} Tier</div>
            <div className={`text-sm mt-0.5 ${
              user?.tier === 'GOLD' ? 'text-yellow-700' :
              user?.tier === 'SILVER' ? 'text-slate-500' : 'text-orange-700'
            }`}>
              {user?.tier === 'GOLD' ? 'All features unlocked · AI chat assistant · Bespoke retraining' :
               user?.tier === 'SILVER' ? 'Quantitative predictions · Confidence intervals · Hotspot map' :
               'Ranked mutation list · Upgrade to unlock quantitative predictions'}
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            user?.tier === 'GOLD' ? 'bg-yellow-500 text-white' :
            user?.tier === 'SILVER' ? 'bg-slate-500 text-white' : 'bg-orange-500 text-white'
          }`}>{user?.tier || 'BRONZE'}</span>
        </div>

        {/* Tier comparison */}
        <h4 className="text-sm font-medium text-gray-700 mb-3">Tier overview</h4>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            {
              name: 'Bronze',
              color: 'orange',
              desc: 'Provide enzyme sequence + target conditions',
              features: ['Ranked mutation list', 'No quantitative scores'],
            },
            {
              name: 'Silver',
              color: 'slate',
              desc: 'Contribute stability assay data',
              features: ['Predicted ddG with confidence intervals', 'Activity-risk scores', 'Residue hotspot map', 'De-identified comparison data'],
            },
            {
              name: 'Gold',
              color: 'yellow',
              desc: 'Full data contribution incl. sequences & activity',
              features: ['All Silver features', 'AI chat assistant', 'Bespoke model retraining', 'Full cross-org data trends'],
            },
          ].map(({ name, color, desc, features }) => {
            const isCurrent = (user?.tier || 'BRONZE') === name.toUpperCase();
            return (
              <div key={name} className={`border rounded-xl p-3 ${isCurrent
                ? color === 'gold' || name === 'Gold' ? 'border-yellow-400 bg-yellow-50'
                : name === 'Silver' ? 'border-slate-400 bg-slate-50'
                : 'border-orange-400 bg-orange-50'
                : 'border-gray-200'}`}>
                <div className={`font-semibold ${
                  name === 'Gold' ? 'text-yellow-700' : name === 'Silver' ? 'text-slate-700' : 'text-orange-700'
                }`}>{name}</div>
                <p className="text-xs text-gray-500 mt-1 mb-2 leading-relaxed">{desc}</p>
                <ul className="space-y-1">
                  {features.map(f => (
                    <li key={f} className="text-xs text-gray-600 flex items-start gap-1">
                      <span className="text-gray-300 flex-shrink-0 mt-0.5">›</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent && <div className="text-xs font-semibold mt-2.5 text-blue-600">Current tier</div>}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Tier thresholds are determined by the quantity, completeness, and quality of data contributed.
          Contact your account manager to discuss tier requirements.
        </p>
      </Section>
    </div>
  );
}
