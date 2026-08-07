import { Link } from 'react-router-dom';
import LegalLayout from '../../components/LegalLayout';
import { SITE } from '../../lib/site';

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of use — FileForge"
      description="The terms you agree to by using FileForge: acceptable use, accuracy limits, liability and governing law."
      path="/terms"
      heading="Terms of use"
      intro={`By using ${SITE.name} you agree to these terms. If you do not agree with them, please do not use the service.`}
    >
      <h2>1. Who may use FileForge</h2>
      <p>
        You must be 18 or older. By using the service you confirm that you are, and that you have
        the authority to agree to these terms on behalf of any organisation you are acting for.
      </p>

      <h2>2. Your files remain yours</h2>
      <p>
        You keep every right in the files you process. You grant us a licence limited to one purpose
        and one duration: to perform the conversion you asked for, until the file is deleted under
        our <Link to="/privacy">privacy policy</Link>. We do not use your files to train anything,
        we do not analyse them for any other purpose, and we do not disclose them.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You must not use {SITE.name} to process:</p>
      <ul>
        <li>material you have no right to copy, convert or distribute;</li>
        <li>child sexual abuse material, or any other content that is illegal in India;</li>
        <li>malware, or documents crafted to attack our systems or other users;</li>
        <li>
          material whose protection you are not authorised to remove. Our Unlock PDF tool decrypts
          only when you supply the correct password, and using it on a document you have no right to
          open is a breach of these terms.
        </li>
      </ul>
      <p>
        You must not attempt to overload, probe or circumvent the service, run automated bulk
        conversions outside the published rate limits, or resell access without a written agreement
        with us.
      </p>

      <h2>4. Accuracy — please read this one</h2>
      <p>
        Conversion is automated and imperfect. This matters most for the finance tools:{' '}
        <strong>
          output produced from a bank statement, GST invoice or Form 26AS must be verified against
          the source document before it is used in books of account, a tax return or any filing.
        </strong>{' '}
        We flag rows we are unsure about and score every extraction, but responsibility for the
        accuracy of what you file remains entirely yours. Do not treat our output as a substitute
        for the original document or for professional advice.
      </p>

      <h2>5. Availability</h2>
      <p>
        The service is provided free and without any uptime commitment. We may change, limit or
        withdraw any tool at any time. Rate limits apply and may be adjusted to keep the service
        usable for everyone.
      </p>

      <h2>6. No warranty</h2>
      <p>
        {SITE.name} is provided “as is”, without warranty of any kind, express or implied, including
        any warranty of merchantability, fitness for a particular purpose, or accuracy of output. We
        do not warrant that conversions will be error-free or that the service will be uninterrupted.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for any indirect, incidental,
        special or consequential loss, or for loss of data, profit, revenue or goodwill, arising
        from your use of the service. Because files are deleted automatically and quickly, you are
        responsible for keeping your own copy of anything you care about. Our total liability for
        any claim relating to the service is limited to the amount you have paid us, which is
        currently nil.
      </p>

      <h2>8. Indemnity</h2>
      <p>
        You agree to indemnify us against claims arising from your breach of these terms or from
        content you process through the service.
      </p>

      <h2>9. Copyright complaints</h2>
      <p>
        See our <Link to="/dmca">takedown page</Link>. Because we do not host or publish user files,
        there is normally nothing for us to take down — but we will act on any report of misuse.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts of {SITE.jurisdiction} have
        exclusive jurisdiction over any dispute arising from them.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms. The “last updated” date at the top will change, and continuing to
        use the service after that constitutes acceptance.
      </p>

      <h2>12. Contact</h2>
      <p>
        {SITE.operator}, {SITE.operatorType}, {SITE.jurisdiction}
        <br />
        <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
    </LegalLayout>
  );
}
