import { describe, it, expect } from 'vitest';
import caMock from '../mocks/contaazul-customer.json';
import omieMock from '../mocks/omie-customer.json';
import { mapContaAzulCustomerToUnified } from '@/lib/providers/implementations/contaazul/mappers/customers';
import { mapOmieCustomerToUnified } from '@/lib/providers/implementations/omie/mappers/customers';
import { UnifiedCustomerSchema } from '@/lib/validations/unified-schemas';

describe('Customer Mappers', () => {
  
  it('should map a Conta Azul customer correctly and pass validation', () => {
    const result = mapContaAzulCustomerToUnified(caMock as any);
    
    // Zod validation (if it fails, it throws)
    expect(() => UnifiedCustomerSchema.parse(result)).not.toThrow();
    
    // Field check
    expect(result.id).toBe(caMock.id);
    expect(result.name).toBe(caMock.nome);
    expect(result.personType).toBe('LEGAL');
    expect(result.remoteData?.provider).toBe('CONTA_AZUL');
    expect(result.remoteData?.raw).toEqual(caMock);
  });

  it('should map an Omie customer correctly and pass validation', () => {
    const result = mapOmieCustomerToUnified(omieMock as any);
    
    // Zod validation
    expect(() => UnifiedCustomerSchema.parse(result)).not.toThrow();
    
    // Field check
    expect(result.id).toBe(omieMock.codigo_cliente.toString());
    expect(result.name).toBe(omieMock.razao_social);
    expect(result.personType).toBe('LEGAL');
    expect(result.remoteData?.provider).toBe('OMIE');
    expect(result.remoteData?.raw).toEqual(omieMock);
  });

});
