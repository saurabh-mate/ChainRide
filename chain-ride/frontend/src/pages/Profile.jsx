import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { pageVariants, pageTransition } from '../components/Animations';
import { FiUser, FiMail, FiPhone, FiStar, FiUpload, FiCheckCircle,
  FiXCircle, FiEdit2, FiSave, FiX, FiMapPin, FiCalendar,
  FiTruck, FiShield, FiDollarSign, FiArrowLeft, FiCamera,
  FiAward, FiClock, FiSettings, FiCreditCard, FiAlertCircle, FiLogOut
} from 'react-icons/fi';
import CountUp from '../components/CountUp';
import { apiGet, apiPut, apiUpload, logout } from '../utils/api';

const SERVER = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:5000';

const TABS = [
  { id: 'overview',  label: 'Overview',  icon: FiUser     },
  { id: 'personal',  label: 'Personal',  icon: FiSettings },
  { id: 'driver',    label: 'Driver',    icon: FiTruck    },
  { id: 'payment',   label: 'Payment',   icon: FiCreditCard },
];

const EMPTY = {
  name: '', email: '', phone: '', bio: '', city: '', dob: '', gender: '',
  vehicleType: 'car', vehicleMake: '', vehicleModel: '', vehicleYear: '',
  vehiclePlate: '', vehicleColor: '', licenseNumber: '',
  walletAddress: '', upiId: '',
  profilePhoto: null, driverQrCode: null,
  rating: 5.0, ratingsCount: 0, earnings: 0,
  completedRidesCount: 0, cancelledRidesCount: 0, driverRidesCount: 0,
  roles: [], isVerified: false, createdAt: null
};

function StatCard({ icon: Icon, label, value, currency, color, subtext }) {
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.02 }}
      className={`rounded-2xl p-5 shadow-sm ${color}`}
    >
      <div className="flex items-center gap-2 mb-3 opacity-80">
        <Icon size={16} />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="text-3xl font-extrabold">
        {currency && <span className="text-lg mr-0.5">₹</span>}
        <CountUp to={value} currency={false} />
      </div>
      {subtext && <p className="text-xs mt-1 opacity-60">{subtext}</p>}
    </motion.div>
  );
}

function Field({ label, value, editing, name, onChange, type = 'text', placeholder = '', options }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {editing ? (
        options ? (
          <select
            name={name}
            value={value}
            onChange={onChange}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          >
            <option value="">Select...</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={type}
            name={name}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        )
      ) : (
        <p className="text-slate-800 font-medium text-sm py-2 px-1 min-h-[36px]">
          {value || <span className="text-slate-400 italic">Not set</span>}
        </p>
      )}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [toast, setToast] = useState(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const avatarInputRef = useRef();
  const qrInputRef = useRef();
  const userId = localStorage.getItem('userId');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch profile ───────────────────────────────────────────────────────
  const fetchProfile = async () => {
    if (!userId) { navigate('/auth'); return; }
    setLoading(true);
    try {
      const data = await apiGet('/profile');
      const profile = data.profile || EMPTY;
      setUser(profile);
      setForm(profile);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  // ── Save profile ─────────────────────────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true);
    try {
      const data = await apiPut('/profile', form);
      setUser(data.profile);
      setForm(data.profile);
      setEditing(false);
      showToast('Profile saved successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm(user);
    setEditing(false);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // ── Upload avatar ─────────────────────────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const data = await apiUpload('/profile/upload-avatar', formData);
      setUser(prev => ({ ...prev, profilePhoto: data.profile.profilePhoto }));
      showToast('Profile photo updated!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Upload QR ─────────────────────────────────────────────────────────────
  const handleQrUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingQr(true);
    const formData = new FormData();
    formData.append('qrCodeUrl', file);
    try {
      const data = await apiUpload('/profile/upload-qr', formData);
      setUser(prev => ({ ...prev, driverQrCode: data.profile.driverQrCode }));
      showToast('Payment QR updated!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadingQr(false);
    }
  };

  const avatarSrc = user.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${SERVER}${user.profilePhoto}`)
    : null;

  const qrSrc = user.driverQrCode
    ? (user.driverQrCode.startsWith('http') ? user.driverQrCode : `${SERVER}${user.driverQrCode}`)
    : null;

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'N/A';

  const completionRate = (user.completedRidesCount + user.cancelledRidesCount) > 0
    ? Math.round((user.completedRidesCount / (user.completedRidesCount + user.cancelledRidesCount)) * 100)
    : 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-slate-50"
      initial="initial" animate="in" exit="out"
      variants={pageVariants} transition={pageTransition}
    >
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold
              ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
          >
            {toast.type === 'error' ? <FiAlertCircle size={16} /> : <FiCheckCircle size={16} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
      <input ref={qrInputRef} type="file" className="hidden" accept="image/*" onChange={handleQrUpload} />

      {/* Hero Banner */}
      <div className="relative h-52 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-16 -left-10 w-64 h-64 bg-white/5 rounded-full blur-2xl" />

        {/* Back btn */}
        <button
          onClick={() => navigate('/dashboard')}
          className="absolute top-5 left-5 bg-white/10 backdrop-blur-md border border-white/20 p-2 rounded-full text-white hover:bg-white/20 transition-colors"
        >
          <FiArrowLeft size={20} />
        </button>

        {/* Logout btn — inline confirmation */}
        {!logoutConfirm ? (
          <button
            onClick={() => setLogoutConfirm(true)}
            className="absolute top-5 left-16 bg-white/10 backdrop-blur-md border border-white/20 px-3 py-2 rounded-full text-white hover:bg-red-500/30 hover:border-red-400/30 transition-colors flex items-center gap-1.5 text-sm font-semibold"
            title="Logout"
          >
            <FiLogOut size={16} /> Logout
          </button>
        ) : (
          <div className="absolute top-5 left-16 flex items-center gap-2 bg-red-600/90 backdrop-blur-md border border-red-400/30 px-3 py-2 rounded-2xl">
            <span className="text-white text-xs font-semibold">Confirm?</span>
            <button onClick={logout} className="text-white bg-red-800 hover:bg-red-700 text-xs font-bold px-2 py-1 rounded-lg transition-colors">Yes</button>
            <button onClick={() => setLogoutConfirm(false)} className="text-white/70 hover:text-white text-xs font-bold px-2 py-1 rounded-lg transition-colors">No</button>
          </div>
        )}

        {/* Edit / Save controls */}
        <div className="absolute top-5 right-5 flex gap-2">
          {editing ? (
            <>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={cancelEdit}
                className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:bg-white/20 transition"
              >
                <FiX size={15} /> Cancel
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-1.5 bg-white text-blue-700 px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-50 transition disabled:opacity-60"
              >
                {saving ? <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" /> : <FiSave size={15} />}
                Save
              </motion.button>
            </>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setEditing(true); setActiveTab('personal'); }}
              className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:bg-white/20 transition"
            >
              <FiEdit2 size={15} /> Edit Profile
            </motion.button>
          )}
        </div>
      </div>

      {/* Avatar + Name Row */}
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-20 sm:-mt-16 mb-8">
          {/* Avatar */}
          <div className="relative shrink-0 mt-8 sm:mt-0 mr-0 sm:mr-8 mb-4 sm:mb-0">
            <div className="w-28 h-28 bg-white rounded-3xl border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
              {uploadingAvatar ? (
                <span className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              ) : avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white text-4xl font-bold">
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute bottom-1 right-1 w-9 h-9 bg-blue-600 hover:bg-blue-700 rounded-full text-white flex items-center justify-center shadow-xl border-2 border-white transition-colors"
              title="Change photo"
            >
              <FiCamera size={14} />
            </button>
          </div>

          {/* Name + Meta */}
          <div className="flex-grow pb-1 text-center sm:text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900">{user.name || 'Your Name'}</h1>
              {user.isVerified && (
                <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg">
                  <FiShield size={11} /> Verified
                </span>
              )}
              {user.roles?.includes('driver') && (
                <span className="text-xs font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-lg">
                  Driver
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-slate-500 text-sm">
              {user.city && <span className="flex items-center gap-1"><FiMapPin size={13} />{user.city}</span>}
              <span className="flex items-center gap-1"><FiCalendar size={13} />Member since {memberSince}</span>
              <span className="flex items-center gap-1 text-orange-500 font-semibold">
                <FiStar className="fill-orange-400" size={13} />
                {user.rating?.toFixed(1)} <span className="text-slate-400 font-normal">({user.ratingsCount} reviews)</span>
              </span>
            </div>
            {user.bio && <p className="text-slate-600 text-sm mt-1.5 max-w-lg">{user.bio}</p>}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl mb-6 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center
                  ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon size={15} />{tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pb-12"
          >
            {/* ── OVERVIEW TAB ────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={FiCheckCircle} label="Completed" value={user.completedRidesCount}
                    color="bg-gradient-to-br from-green-500 to-emerald-600 text-white" subtext="rides as passenger" />
                  <StatCard icon={FiTruck} label="Driven" value={user.driverRidesCount || 0}
                    color="bg-gradient-to-br from-blue-500 to-indigo-600 text-white" subtext="rides as driver" />
                  <StatCard icon={FiDollarSign} label="Earnings" value={user.earnings}
                    color="bg-gradient-to-br from-slate-800 to-slate-900 text-white" subtext="total earned" currency />
                  <StatCard icon={FiXCircle} label="Cancelled" value={user.cancelledRidesCount}
                    color="bg-white border border-slate-100 shadow-sm text-slate-800" subtext="rides cancelled" />
                </div>

                {/* Completion Rate */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FiAward size={17} className="text-orange-500" /> Ride Completion Rate</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-grow bg-slate-100 rounded-full h-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${completionRate}%` }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                        className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                      />
                    </div>
                    <span className="text-2xl font-extrabold text-slate-800 shrink-0">{completionRate}%</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-2">{user.completedRidesCount} completed out of {user.completedRidesCount + user.cancelledRidesCount} total rides</p>
                </div>

                {/* Quick Snapshot */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><FiUser size={16} className="text-blue-500" /> Quick Info</h3>
                    {[
                      { label: 'Email', value: user.email, icon: FiMail },
                      { label: 'Phone', value: user.phone, icon: FiPhone },
                      { label: 'City', value: user.city, icon: FiMapPin },
                      { label: 'Gender', value: user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : null, icon: FiUser },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                          <Icon size={15} />
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 font-medium">{label}</p>
                          <p className="text-sm text-slate-800 font-semibold">{value || <span className="text-slate-300">Not set</span>}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {user.roles?.includes('driver') && (user.vehicleMake || user.vehiclePlate) && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><FiTruck size={16} className="text-purple-500" /> Vehicle</h3>
                      {[
                        { label: 'Type', value: user.vehicleType ? user.vehicleType.toUpperCase() : null },
                        { label: 'Make / Model', value: [user.vehicleMake, user.vehicleModel, user.vehicleYear].filter(Boolean).join(' ') },
                        { label: 'Plate Number', value: user.vehiclePlate },
                        { label: 'Color', value: user.vehicleColor },
                        { label: 'License No.', value: user.licenseNumber },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-slate-400 font-medium">{label}</p>
                          <p className="text-sm text-slate-800 font-semibold">{value || <span className="text-slate-300">Not set</span>}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PERSONAL TAB ────────────────────────────────────────── */}
            {activeTab === 'personal' && (
              <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <FiUser size={18} className="text-blue-500" /> Personal Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="Full Name" name="name" value={form.name} editing={editing} onChange={handleFormChange} placeholder="John Doe" />
                  <Field label="Email Address" name="email" value={form.email} editing={editing} onChange={handleFormChange} type="email" placeholder="john@example.com" />
                  <Field label="Phone Number" name="phone" value={form.phone} editing={editing} onChange={handleFormChange} placeholder="+91 9876543210" />
                  <Field label="City" name="city" value={form.city} editing={editing} onChange={handleFormChange} placeholder="Mumbai" />
                  <Field label="Date of Birth" name="dob" value={form.dob} editing={editing} onChange={handleFormChange} type="date" />
                  <Field label="Gender" name="gender" value={form.gender} editing={editing} onChange={handleFormChange}
                    options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]}
                  />
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Bio</label>
                    {editing ? (
                      <textarea
                        name="bio"
                        value={form.bio || ''}
                        onChange={handleFormChange}
                        placeholder="Tell passengers a little about yourself..."
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                      />
                    ) : (
                      <p className="text-slate-800 font-medium text-sm py-2 px-1 min-h-[60px]">
                        {form.bio || <span className="text-slate-400 italic">No bio yet</span>}
                      </p>
                    )}
                  </div>
                </div>

                {editing && (
                  <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
                    <button onClick={cancelEdit} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
                      <FiX size={15} /> Cancel
                    </button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={saveProfile} disabled={saving}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-md transition disabled:opacity-60"
                    >
                      {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave size={15} />}
                      Save Changes
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            {/* ── DRIVER TAB ──────────────────────────────────────────── */}
            {activeTab === 'driver' && (
              <div className="space-y-5">
                {!user.roles?.includes('driver') && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
                    <FiShield className="text-amber-500 mt-0.5 shrink-0" size={18} />
                    <div>
                      <p className="font-semibold text-amber-700 text-sm">Driver profile not active</p>
                      <p className="text-amber-600 text-xs mt-0.5">You are currently registered as a passenger only. Driver details are available once you register as a driver.</p>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <FiTruck size={18} className="text-purple-500" /> Vehicle Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Vehicle Type" name="vehicleType" value={form.vehicleType} editing={editing} onChange={handleFormChange}
                      options={[
                        { value: 'car', label: 'Car' },
                        { value: 'bike', label: 'Bike' },
                        { value: 'auto', label: 'Auto' },
                        { value: 'mini', label: 'Mini' },
                        { value: 'sedan', label: 'Sedan' },
                        { value: 'suv', label: 'SUV' },
                        { value: 'ev', label: 'EV' },
                      ]} />
                    <Field label="Vehicle Make" name="vehicleMake" value={form.vehicleMake} editing={editing} onChange={handleFormChange} placeholder="Toyota" />
                    <Field label="Vehicle Model" name="vehicleModel" value={form.vehicleModel} editing={editing} onChange={handleFormChange} placeholder="Innova" />
                    <Field label="Year" name="vehicleYear" value={form.vehicleYear} editing={editing} onChange={handleFormChange} placeholder="2022" />
                    <Field label="Color" name="vehicleColor" value={form.vehicleColor} editing={editing} onChange={handleFormChange} placeholder="White" />
                    <Field label="Plate Number" name="vehiclePlate" value={form.vehiclePlate} editing={editing} onChange={handleFormChange} placeholder="MH 12 AB 1234" />
                    <Field label="Driving License No." name="licenseNumber" value={form.licenseNumber} editing={editing} onChange={handleFormChange} placeholder="MH1234567890" />
                  </div>

                  {editing && (
                    <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
                      <button onClick={cancelEdit} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
                        <FiX size={15} /> Cancel
                      </button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={saveProfile} disabled={saving}
                        className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-md transition disabled:opacity-60"
                      >
                        {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave size={15} />}
                        Save Changes
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PAYMENT TAB ─────────────────────────────────────────── */}
            {activeTab === 'payment' && (
              <div className="space-y-5">
                {/* UPI / Wallet */}
                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <FiCreditCard size={18} className="text-green-500" /> Payment Details
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="UPI ID" name="upiId" value={form.upiId} editing={editing} onChange={handleFormChange} placeholder="name@okaxis" />
                    <Field label="Crypto Wallet Address" name="walletAddress" value={form.walletAddress} editing={editing} onChange={handleFormChange} placeholder="0x..." />
                  </div>
                  {editing && (
                    <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
                      <button onClick={cancelEdit} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
                        <FiX size={15} /> Cancel
                      </button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={saveProfile} disabled={saving}
                        className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-md transition disabled:opacity-60"
                      >
                        {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave size={15} />}
                        Save Changes
                      </motion.button>
                    </div>
                  )}
                </div>

                {/* Driver QR Code */}
                {user.roles?.includes('driver') && (
                  <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FiShield size={18} className="text-purple-500" /> Driver Payment QR
                      </h2>
                      <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2 py-1 rounded-lg border border-purple-100">Drivers Only</span>
                    </div>
                    <p className="text-slate-500 text-sm mb-6">Upload your PhonePe / GPay / Paytm QR so passengers can pay directly after the ride.</p>

                    <div
                      onClick={() => qrInputRef.current?.click()}
                      className="relative flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors overflow-hidden"
                      style={{ minHeight: 220 }}
                    >
                      {uploadingQr ? (
                        <span className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                      ) : qrSrc ? (
                        <div className="relative group w-full flex items-center justify-center p-4">
                          <img src={qrSrc} alt="QR Code" className="max-h-48 object-contain" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl">
                            <div className="flex items-center gap-2 bg-white text-slate-800 px-4 py-2 rounded-xl font-semibold text-sm shadow">
                              <FiUpload size={14} /> Replace QR
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-slate-400 gap-2 py-8">
                          <FiUpload size={30} className="mb-1" />
                          <span className="font-semibold text-sm">Click to upload QR image</span>
                          <span className="text-xs text-slate-300">PNG, JPG up to 5MB</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
