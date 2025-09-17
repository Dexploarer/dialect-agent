import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'error';
  message?: string;
}

export default function ConnectivityStatus() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Backend API', status: 'offline' },
    { name: 'AI Service', status: 'offline' },
    { name: 'Database', status: 'offline' },
    { name: 'Dialect MCP', status: 'offline' },
  ]);

  useEffect(() => {
    const checkServices = async () => {
      const newServices: ServiceStatus[] = [];

      // Check backend health
      try {
        const response = await fetch('/health');
        if (response.ok) {
          const data = await response.json();
          newServices.push({ name: 'Backend API', status: 'online' });
          newServices.push({ 
            name: 'AI Service', 
            status: data.ai?.status === 'healthy' ? 'online' : 'error',
            message: data.ai?.message
          });
          newServices.push({ name: 'Database', status: 'online' });
        } else {
          newServices.push({ name: 'Backend API', status: 'error' });
        }
      } catch (error) {
        newServices.push({ name: 'Backend API', status: 'offline' });
      }

      // Check Dialect MCP
      try {
        const response = await fetch('/api/dialect/mcp/status');
        if (response.ok) {
          const data = await response.json();
          newServices.push({ 
            name: 'Dialect MCP', 
            status: data.connected ? 'online' : 'error',
            message: data.connected ? undefined : 'Not connected to Dialect APIs'
          });
        } else {
          newServices.push({ name: 'Dialect MCP', status: 'error' });
        }
      } catch (error) {
        newServices.push({ name: 'Dialect MCP', status: 'offline' });
      }

      setServices(newServices);
    };

    checkServices();
    const interval = setInterval(checkServices, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'error':
        return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />;
      default:
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge variant="default" className="bg-green-100 text-green-800">Online</Badge>;
      case 'error':
        return <Badge variant="destructive" className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      default:
        return <Badge variant="destructive">Offline</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircleIcon className="w-5 h-5" />
          System Connectivity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(service.status)}
              <span className="text-sm font-medium">{service.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(service.status)}
              {service.message && (
                <span className="text-xs text-gray-500">{service.message}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}