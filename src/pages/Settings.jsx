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

  const handleSave = (e) => {
    e.preventDefault();
    updateUser(profile);
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
            {[
              { label: 'Full name', field: 'name', type: 'text', placeholder: 'Dr. Jane Smith' },
              { label: 'Email', field: 'email', type: 'email', placeholder: 'you@institution.edu' },
              { label: 'Institution', field: 'institution', type: 'text', placeholder: 'University or Company' },
              { label: 'Role', field: 'role', type: 'text', placeholder: 'Senior Scientist' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                <input type={type} value={profile[field]} onChange={set(field)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={placeholder} />
              </div>
            ))}
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
        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
          <div>
            <div className="font-semibold text-blue-900">Researcher Plan</div>
            <div className="text-sm text-blue-700 mt-0.5">500 predictions/month · 5 active projects · Priority support</div>
          </div>
          <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">ACTIVE</span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          {[
            { label: 'Predictions used', value: '24 / 500' },
            { label: 'Projects', value: '3 / 5' },
            { label: 'Resets in', value: '8 days' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <div className="font-semibold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Available plans</h4>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { name: 'Starter', price: 'Free', desc: '50 predictions/mo · 1 project', current: false },
              { name: 'Researcher', price: '$49/mo', desc: '500 predictions/mo · 5 projects', current: true },
              { name: 'Enterprise', price: 'Contact us', desc: 'Unlimited · Custom integrations', current: false },
            ].map(({ name, price, desc, current }) => (
              <div key={name} className={`border rounded-xl p-3 ${current ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                <div className="font-semibold text-gray-900">{name}</div>
                <div className="text-blue-600 font-bold mt-0.5">{price}</div>
                <div className="text-xs text-gray-500 mt-1">{desc}</div>
                {current && <div className="text-xs text-blue-600 font-medium mt-2">Current plan</div>}
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
