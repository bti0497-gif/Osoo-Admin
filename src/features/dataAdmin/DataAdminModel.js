import { apiClient } from '../../core/api';

const adminParams = (currentUser = {}) => ({
  role: currentUser.role || 'admin',
  name: currentUser.name || 'admin',
});

export const DataAdminModel = {
  async fetchTables(currentUser) {
    return apiClient.get('/api/admin-data/tables', adminParams(currentUser));
  },

  async fetchRows(table, params, currentUser) {
    return apiClient.get(`/api/admin-data/${encodeURIComponent(table)}`, {
      ...adminParams(currentUser),
      ...params,
    });
  },

  async updateRow(table, rowKey, changes, currentUser) {
    return apiClient.put(`/api/admin-data/${encodeURIComponent(table)}/${encodeURIComponent(rowKey)}`, {
      ...adminParams(currentUser),
      changes,
    });
  },

  async deleteRow(table, rowKey, currentUser) {
    const query = new URLSearchParams(adminParams(currentUser)).toString();
    return apiClient.delete(`/api/admin-data/${encodeURIComponent(table)}/${encodeURIComponent(rowKey)}?${query}`);
  },
};
