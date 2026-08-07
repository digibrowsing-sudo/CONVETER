import LegalLayout from '../../components/LegalLayout';
import { SITE } from '../../lib/site';

export default function Refund() {
  return (
    <LegalLayout
      title="Refund policy — FileForge"
      description="FileForge is free to use and takes no payments. This page states the policy that will apply if that changes."
      path="/refund"
      heading="Refund and cancellation policy"
    >
      <h2>Today: nothing is charged</h2>
      <p>
        Every tool on {SITE.name} is free. We take no payments, hold no card details and issue no
        invoices, so there is nothing to refund. There is no account to cancel — the service does
        not have accounts.
      </p>

      <h2>If we introduce a paid plan</h2>
      <p>
        This page exists so the terms are settled before any money changes hands rather than after.
        When a paid tier is introduced, the following will apply and this page will be updated with
        the specifics:
      </p>
      <ul>
        <li>
          <strong>Seven-day refund window.</strong> A full refund on request within seven days of a
          charge, without needing to give a reason.
        </li>
        <li>
          <strong>Failed conversions are never billable.</strong> If a conversion fails, that usage
          is not counted and any charge for it is refunded automatically.
        </li>
        <li>
          <strong>Cancel at any time.</strong> A subscription cancelled mid-period keeps working
          until the end of the period already paid for and does not renew.
        </li>
        <li>
          <strong>Processing time.</strong> Refunds are returned to the original payment method,
          normally within 5 to 7 working days once approved.
        </li>
        <li>
          <strong>GST.</strong> Indian customers receive a GST-compliant invoice; a refund reverses
          the tax charged along with the fee.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Billing questions, once billing exists, go to{' '}
        <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </LegalLayout>
  );
}
