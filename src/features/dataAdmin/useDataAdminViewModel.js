import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataAdminModel } from './DataAdminModel';

const DEFAULT_FILTERS = {
  siteName: '',
  siteId: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

export const useDataAdminViewModel = (currentUser) => {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editText, setEditText] = useState('');

  const tableMeta = useMemo(
    () => tables.find((table) => table.id === selectedTable) || null,
    [tables, selectedTable]
  );

  const loadTables = useCallback(async () => {
    setError('');
    const data = await DataAdminModel.fetchTables(currentUser);
    setTables(data.tables || []);
    setSelectedTable((current) => current || data.tables?.[0]?.id || '');
  }, [currentUser]);

  const loadRows = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    setError('');
    try {
      const data = await DataAdminModel.fetchRows(selectedTable, filters, currentUser);
      setRows(data.rows || []);
      setColumns(data.columns || []);
    } catch (err) {
      setError(err.message || '데이터 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentUser, filters, selectedTable]);

  useEffect(() => {
    loadTables().catch((err) => setError(err.message || '테이블 목록 조회에 실패했습니다.'));
  }, [loadTables]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const updateFilter = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const startEdit = (row) => {
    const { __rowKey, ...editable } = row;
    void __rowKey;
    setEditingRow(row);
    setEditText(JSON.stringify(editable, null, 2));
  };

  const saveEdit = async () => {
    if (!editingRow) return;
    setLoading(true);
    setError('');
    try {
      const changes = JSON.parse(editText);
      await DataAdminModel.updateRow(selectedTable, editingRow.__rowKey, changes, currentUser);
      setEditingRow(null);
      await loadRows();
    } catch (err) {
      setError(err.message || '수정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const deleteRow = async (row) => {
    const ok = window.confirm('선택한 행을 삭제하시겠습니까? 이 작업은 관리자 작업으로 기록 없이 즉시 반영됩니다.');
    if (!ok) return;
    setLoading(true);
    setError('');
    try {
      await DataAdminModel.deleteRow(selectedTable, row.__rowKey, currentUser);
      await loadRows();
    } catch (err) {
      setError(err.message || '삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return {
    tables,
    selectedTable,
    setSelectedTable,
    tableMeta,
    filters,
    updateFilter,
    resetFilters,
    rows,
    columns,
    loading,
    error,
    refresh: loadRows,
    editingRow,
    editText,
    setEditText,
    startEdit,
    cancelEdit: () => setEditingRow(null),
    saveEdit,
    deleteRow,
  };
};
