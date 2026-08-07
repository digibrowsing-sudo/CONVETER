import { Link } from 'react-router-dom';
import LegalLayout from '../../components/LegalLayout';
import { SITE } from '../../lib/site';

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy policy — FileForge"
      description="What FileForge collects, how long files are kept, and how to have them erased. Most tools never upload your file at all."
      path="/privacy"
      heading="Privacy policy"
      intro={`${SITE.name} is operated by ${SITE.operator} (${SITE.operatorType}) in ${SITE.jurisdiction}. This policy explains what happens to a file you give us — and, for most of our tools, the answer is that we never receive it.`}
    >
      <h2>The short version</h2>
      <ul>
        <li>
          Tools marked <strong>“no upload”</strong> run entirely in your browser. The file is never
          transmitted to us and never exists on our servers.
        </li>
        <li>
          For server-side tools, the file is deleted within {SITE.retention.standardMinutes} minutes
          — {SITE.retention.financeMinutes} minutes for finance documents, or immediately on
          download.
        </li>
        <li>We never store file contents, filenames, or anything extracted from a document.</li>
        <li>We do not store your IP address. We do not use advertising or tracking cookies.</li>
        <li>We do not sell, rent or share your data with anyone.</li>
      </ul>

      <h2>Who is responsible</h2>
      <p>
        For the purposes of the Digital Personal Data Protection Act 2023, {SITE.operator} is the
        Data Fiduciary for personal data processed through {SITE.name}. Contact details for the
        Grievance Officer are at the bottom of this page and on our{' '}
        <Link to="/contact">contact page</Link>.
      </p>

      <h2>What we collect, and why</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Why</th>
            <th>Kept for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>The file you upload (server-side tools only)</td>
            <td>To perform the conversion you asked for, and nothing else</td>
            <td>
              {SITE.retention.standardMinutes} minutes; {SITE.retention.financeMinutes} minutes for
              finance tools, or until you download it
            </td>
          </tr>
          <tr>
            <td>The converted output</td>
            <td>So you can download it</td>
            <td>Same as above</td>
          </tr>
          <tr>
            <td>A hash of your IP address</td>
            <td>Rate limiting and abuse prevention</td>
            <td>Up to 24 hours</td>
          </tr>
          <tr>
            <td>
              Job metadata: which tool ran, file size, duration, success or failure, error code
            </td>
            <td>To keep the service working and to see which tools are used</td>
            <td>{SITE.retention.jobRecordDays} days, then aggregated to daily counts</td>
          </tr>
          <tr>
            <td>Anonymous page analytics</td>
            <td>To understand which pages are useful</td>
            <td>Aggregated; no cookies, no cross-site identifiers</td>
          </tr>
        </tbody>
      </table>

      <h3>What we deliberately do not collect</h3>
      <ul>
        <li>
          <strong>Your raw IP address.</strong> It is hashed with a salt that changes every day, so
          the same address produces a different value tomorrow and cannot be joined into a history.
        </li>
        <li>
          <strong>File contents or anything extracted from them.</strong> There is no column in our
          database capable of holding document content. Adding one would require a documented
          architecture decision and a change to this policy.
        </li>
        <li>
          <strong>Filenames.</strong> Your file is renamed on arrival and its original name is never
          written to a log or a database.
        </li>
        <li>
          <strong>Passwords.</strong> A password you enter to protect or unlock a PDF is held in
          memory for the length of that one operation and never written anywhere.
        </li>
        <li>
          <strong>Accounts and email addresses.</strong> There is no sign-up.
        </li>
      </ul>

      <h2>Finance documents</h2>
      <p>
        A bank statement, GST invoice or Form 26AS is personal data, and financial information is
        also “Sensitive Personal Data or Information” under the Information Technology (Reasonable
        Security Practices) Rules 2011. These documents are handled under stricter rules than
        anything else on the site:
      </p>
      <ul>
        <li>You must give explicit consent, on the tool page, before the document is processed.</li>
        <li>It is deleted after {SITE.retention.financeMinutes} minutes, or the moment you download the result.</li>
        <li>
          The only things recorded are the document type, the bank format detected, the number of
          rows read and a confidence score. No transaction, name, PAN, GSTIN, account number or
          balance is stored.
        </li>
        <li>Processing runs in a sandboxed container with no access to the internet.</li>
      </ul>

      <h2>Legal basis</h2>
      <p>
        Under the DPDP Act we rely on your consent, given when you upload a file for a specific
        conversion. Under the GDPR — which applies if you are in the EU or EEA — we rely on
        legitimate interest for performing the conversion you requested, and on consent for the
        finance module. We set no advertising or analytics cookies, so no cookie banner is needed.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Erasure.</strong> Every result page has a “delete from our servers now” button
          that removes the file immediately. Everything is deleted automatically in any case.
        </li>
        <li>
          <strong>Access and correction.</strong> Since we hold no account and no document content,
          there is generally nothing to disclose or correct — but write to us and we will confirm
          what, if anything, relates to you.
        </li>
        <li>
          <strong>Withdrawal of consent.</strong> Stop using the tool, or delete the job. There is
          nothing further to withdraw.
        </li>
        <li>
          <strong>Grievance.</strong> Contact the Grievance Officer below. You may also complain to
          the Data Protection Board of India, or to your supervisory authority in the EU or EEA.
        </li>
      </ul>

      <h2>Sub-processors and transfers</h2>
      <p>
        Files are processed on our own server in Mumbai, India. We do not send your files to any
        third-party conversion service, AI model or analytics provider. Our hosting provider has
        physical custody of the machine, and error reports may be sent to an error-tracking service
        with all filenames, paths and file contents stripped before transmission.
      </p>

      <h2>Children</h2>
      <p>
        {SITE.name} is not intended for anyone under 18, and our <Link to="/terms">terms</Link>{' '}
        require you to be 18 or older. We do not knowingly process a child’s personal data. If you
        believe we have, write to the Grievance Officer and it will be deleted.
      </p>

      <h2>Breach notification</h2>
      <p>
        If a personal data breach occurs we will notify the Data Protection Board of India and
        affected users without undue delay, as the DPDP Act requires.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that affects how your data is handled, the “last updated”
        date at the top will change and the substantive change will be described here.
      </p>

      <h2>Grievance Officer</h2>
      <p>
        {SITE.grievanceOfficer.name}, {SITE.grievanceOfficer.role}
        <br />
        <a href={`mailto:${SITE.grievanceOfficer.email}`}>{SITE.grievanceOfficer.email}</a>
        <br />
        Response time: {SITE.grievanceOfficer.responseSla}.
      </p>
    </LegalLayout>
  );
}
