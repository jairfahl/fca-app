import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

type PaywallCardProps = {
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
};

export default function PaywallCard({
  title = 'Conteúdo disponível apenas no plano FULL',
  description = 'Este conteúdo exige plano FULL ativo.',
  primaryLabel = 'Ver planos',
  primaryHref = '/paywall',
  secondaryLabel = 'Voltar',
  secondaryHref = '/results',
  note
}: PaywallCardProps) {
  return (
    <Card>
      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{title}</div>
      <div style={{ marginBottom: '1rem', color: '#6b7280' }}>{description}</div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button href={primaryHref}>{primaryLabel}</Button>
        <Button variant="ghost" href={secondaryHref}>{secondaryLabel}</Button>
      </div>
      {note ? (
        <div style={{ marginTop: '0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
          {note}
        </div>
      ) : null}
    </Card>
  );
}
