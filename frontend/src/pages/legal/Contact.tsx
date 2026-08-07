import { Link } from 'react-router-dom';
import LegalLayout from '../../components/LegalLayout';
import { SITE } from '../../lib/site';

export default function Contact() {
  return (
    <LegalLayout
      title="Contact FileForge — support and grievance officer"
      description="How to reach FileForge, including the published grievance officer details required under the DPDP Act and the IT Rules."
      path="/contact"
      heading="Contact"
      intro="There is no contact form here on purpose: a form would mean collecting your email address and storing your message, and we would rather not hold either. Email works."
    >
      <h2>Grievance Officer</h2>
      <p>
        Published as required by the Digital Personal Data Protection Act 2023 and the Information
        Technology (Intermediary Guidelines) Rules 2021.
      </p>
      <p>
        <strong>{SITE.grievanceOfficer.name}</strong>, {SITE.grievanceOfficer.role}
        <br />
        <a href={`mailto:${SITE.grievanceOfficer.email}`}>{SITE.grievanceOfficer.email}</a>
        <br />
        {SITE.operator}, {SITE.operatorType}
        <br />
        {SITE.jurisdiction}
      </p>
      <p>
        Acknowledgement within 72 hours; substantive response within {SITE.grievanceOfficer.responseSla.replace('and an acknowledgement within 72 hours', '15 days')}.
        Use this address for anything about your personal data: erasure, a complaint, or a question
        about how a document was handled.
      </p>

      <h2>Everything else</h2>
      <table>
        <tbody>
          <tr>
            <td>General questions, bug reports, feature requests</td>
            <td>
              <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
            </td>
          </tr>
          <tr>
            <td>Privacy and data protection</td>
            <td>
              <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>
            </td>
          </tr>
          <tr>
            <td>Copyright and takedown</td>
            <td>
              <a href={`mailto:${SITE.dmcaEmail}`}>{SITE.dmcaEmail}</a>
            </td>
          </tr>
          <tr>
            <td>Security vulnerabilities</td>
            <td>
              <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> — see our{' '}
              <Link to="/security">security page</Link>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Asking for a new bank parser</h2>
      <p>
        This is the most useful thing you can email us. If a statement will not convert, tell us
        which bank and which account type it is — a current account statement often looks nothing
        like a savings one. Please <strong>do not send us the statement itself</strong>; we do not
        want it and we are not set up to hold it. A description is enough to get started, and we
        will ask for a redacted sample if we need one.
      </p>

      <h2>What we cannot do</h2>
      <ul>
        <li>
          Recover a file you have already converted. Everything is deleted within the hour, and
          within 15 minutes for finance documents — we have no copy and no backup of your files.
        </li>
        <li>
          Recover a password for a PDF you encrypted. AES-256 has no back door, including for us.
        </li>
        <li>Open a PDF for you without its password. See our <Link to="/dmca">takedown page</Link>.</li>
      </ul>
    </LegalLayout>
  );
}
