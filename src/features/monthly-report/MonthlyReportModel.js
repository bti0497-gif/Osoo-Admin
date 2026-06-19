import { apiClient } from '../../core/api';
import { getApiBase } from '../../core/api/serverConfig';

export const MonthlyReportModel = {
  async getSites(year, month) {
    return apiClient.get(`/api/monthly-report/sites?year=${year}&month=${month}`);
  },

  async getData(year, month, siteId, siteName) {
    return apiClient.get(
      `/api/monthly-report/data?year=${year}&month=${month}&siteId=${encodeURIComponent(siteId)}&siteName=${encodeURIComponent(siteName)}`
    );
  },

  async exportExcel(year, month, sites, templatePath) {
    const response = await fetch(`${getApiBase()}/api/monthly-report/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, sites, templatePath }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Excel 내보내기 실패');
    }
    return response.blob();
  },
};
