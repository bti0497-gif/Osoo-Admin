import { getApiBase } from '../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

export const GyeonggiMonthlyReportModel = {
  async getSites(year, month) {
    const res = await fetch(`${getApiBase()}/api/gyeonggi/monthly-report/sites?year=${year}&month=${month}`, {
      headers: adminHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '현장 목록 조회 실패');
    return data;
  },

  async exportExcel(year, month, sites) {
    const response = await fetch(`${getApiBase()}/api/gyeonggi/monthly-report/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...adminHeaders(),
      },
      body: JSON.stringify({ year, month, sites }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || '월운영보고서 출력 실패');
    }

    return response.blob();
  },
};
