type DemoRole = {
  key: string;
  label: string;
  description: string;
  isActive: boolean;
  permissions: string[];
};

type DemoProfessional = {
  id: string;
  role: string;
  isActive: boolean;
  name: string;
};

export function useStore() {
  return {
    config: {
      name: 'MS Manager',
      roles: [] as DemoRole[],
    },
    professionals: [] as DemoProfessional[],
  };
}
