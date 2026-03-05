import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function useCrud(endpoint) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(endpoint);
      const key = Object.keys(res.data).find((k) => Array.isArray(res.data[k]));
      setData(key ? res.data[key] : []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function create(payload) {
    const res = await api.post(endpoint, payload);
    await fetchAll();
    return res.data;
  }

  async function update(id, payload) {
    const res = await api.put(`${endpoint}/${id}`, payload);
    await fetchAll();
    return res.data;
  }

  async function remove(id) {
    await api.delete(`${endpoint}/${id}`);
    await fetchAll();
  }

  return { data, loading, error, fetchAll, create, update, remove };
}
