import type { UnifiedCompany, UnifiedContact, UnifiedDeal } from '@/types/unified';

/**
 * Fake CRM records for a sandbox account.
 *
 * Written through the unified API, which makes seeding a real end to end
 * exercise of the mappers rather than a shortcut around them.
 *
 * Everything carries a marker in its name. A trial account is shared with
 * whoever else is trying the product, and someone has to be able to tell what
 * a script put there from what a person did.
 */

export const SANDBOX_MARKER = '[sandbox]';

export function isSandboxRecord(name: string | null | undefined): boolean {
  return (name ?? '').includes(SANDBOX_MARKER);
}

const COMPANY_NAMES = [
  'Padaria Sao Jorge',
  'Metalurgica Aurora',
  'Transportes Bandeirante',
  'Clinica Vida Plena',
  'Editora Farol',
  'Construtora Pedra Alta',
  'Mercado Bom Preco',
  'Oficina Motor Livre',
];

const PEOPLE = [
  { first: 'Ana', last: 'Ribeiro', title: 'Diretora Comercial' },
  { first: 'Bruno', last: 'Carvalho', title: 'Gerente de Compras' },
  { first: 'Carla', last: 'Nogueira', title: 'Socia' },
  { first: 'Diego', last: 'Fontes', title: 'Coordenador de TI' },
  { first: 'Elisa', last: 'Marques', title: 'Analista Financeira' },
  { first: 'Fabio', last: 'Teixeira', title: 'Gerente de Operacoes' },
  { first: 'Giovana', last: 'Prado', title: 'Head de Marketing' },
  { first: 'Henrique', last: 'Lopes', title: 'Comprador' },
  { first: 'Isabel', last: 'Moreira', title: 'Diretora Financeira' },
  { first: 'Joao', last: 'Almeida', title: 'Vendedor' },
  { first: 'Karina', last: 'Dias', title: 'Gerente de Contas' },
  { first: 'Lucas', last: 'Barros', title: 'Analista de Suprimentos' },
];

const DEAL_SUBJECTS = [
  'Implantacao do sistema',
  'Renovacao anual',
  'Expansao de licencas',
  'Projeto piloto',
  'Migracao de dados',
  'Consultoria de processos',
  'Contrato de suporte',
  'Integracao fiscal',
];

/** Cycles the lists, so any count works without repeating a name verbatim. */
function pick<T>(list: T[], index: number): { value: T; suffix: string } {
  const round = Math.floor(index / list.length) + 1;
  return { value: list[index % list.length], suffix: round > 1 ? ` ${round}` : '' };
}

export function sandboxCompany(index: number): Partial<UnifiedCompany> {
  const { value, suffix } = pick(COMPANY_NAMES, index);
  const slug = value.toLowerCase().replace(/[^a-z]+/g, '');

  return {
    name: `${value}${suffix} ${SANDBOX_MARKER}`,
    website: `https://${slug}.com.br`,
  };
}

export function sandboxContact(index: number, companyId: string | null): Partial<UnifiedContact> {
  const { value, suffix } = pick(PEOPLE, index);
  const handle = `${value.first}.${value.last}${suffix.trim()}`.toLowerCase();

  return {
    name: `${value.first} ${value.last}${suffix} ${SANDBOX_MARKER}`,
    email: `${handle}@exemplo.com.br`,
    // A Brazilian mobile, in the shape RD accepts, varying per record.
    phones: [`+55119${String(80000000 + index * 137).slice(0, 8)}`],
    title: value.title,
    companyId,
  };
}

export function sandboxDeal(
  index: number,
  refs: { companyId: string | null; contactId: string | null; stageId: string | null }
): Partial<UnifiedDeal> {
  const { value, suffix } = pick(DEAL_SUBJECTS, index);

  return {
    name: `${value}${suffix} ${SANDBOX_MARKER}`,
    // Round numbers that are obviously not real money.
    amount: 2500 + (index % 8) * 1500,
    companyId: refs.companyId,
    contactIds: refs.contactId ? [refs.contactId] : [],
    stageId: refs.stageId,
  };
}
