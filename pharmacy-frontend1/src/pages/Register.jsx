// src/pages/Register.jsx
import { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

function Register() {
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'cashier', // default role
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validate = () => {
    if (!form.name.trim()) return 'Name is required';
    if (!form.email.trim()) return 'Email is required';
    // very basic email check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email';
    if (!form.password) return 'Password is required';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    if (!['admin', 'cashier'].includes(form.role)) return 'Invalid role selected';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    try {
      // Adjust payload keys to match your backend if needed
      await axios.post(`${API}/auth/register`, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role
      });
      alert('Registration successful! Please log in.');
      navigate('/'); // go to Login
    } catch (err) {
      const serverMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        '';
      setError(serverMsg || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Create Account</h2>
        <p className="auth-subtitle">Register a new pharmacy user</p>
        <div className="auth-divider" />

        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={form.name}
          onChange={onChange}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Email address"
          value={form.email}
          onChange={onChange}
          required
        />

        <select
          name="role"
          value={form.role}
          onChange={onChange}
          required
        >
          <option value="cashier">Cashier</option>
          <option value="admin">Admin</option>
        </select>

        <input
          type="password"
          name="password"
          placeholder="Password (min 6 chars)"
          value={form.password}
          onChange={onChange}
          required
        />

        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm Password"
          value={form.confirmPassword}
          onChange={onChange}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Register'}
        </button>

        {error && (
          <p className="auth-error">
            {error}
            {error.toLowerCase().includes('already') && (
              <><br /><Link to="/" style={{ color: 'var(--danger)', fontWeight: 700 }}> → Sign in instead</Link></>
            )}
          </p>
        )}
        <p>
          Already have an account? <Link to="/">Sign in</Link>
        </p>
      </form>
    </div>
  );
}

export default Register;
