import { Link } from 'react-router-dom';
import LegalLayout from '../../components/LegalLayout';
import { SITE } from '../../lib/site';

export default function Dmca() {
  return (
    <LegalLayout
      title="Copyright and takedown policy — FileForge"
      description="How to report copyright infringement or misuse of FileForge, and why there is usually nothing hosted to take down."
      path="/dmca"
      heading="Copyright and takedown"
    >
      <h2>What we host</h2>
      <p>
        {SITE.name} does not publish, index or share user files. There is no gallery, no public
        link and no search. A file exists on our servers only for the few minutes it takes to
        convert it, and only the person who uploaded it can retrieve the result — with a signed,
        expiring link. Most of our tools never receive the file at all, because they run in your
        browser.
      </p>
      <p>
        This means there is normally nothing on our systems to take down: by the time a report
        reaches us, the file is already gone. We still want to hear from you, because a pattern of
        misuse is something we can act on.
      </p>

      <h2>Reporting infringement or misuse</h2>
      <p>
        Email <a href={`mailto:${SITE.dmcaEmail}`}>{SITE.dmcaEmail}</a> with:
      </p>
      <ul>
        <li>a description of the work and of the infringing use;</li>
        <li>any URL, job reference or timestamp you have;</li>
        <li>your name, organisation and contact details;</li>
        <li>a statement that you believe the use is not authorised by the rights holder or by law;</li>
        <li>
          a statement that the information is accurate and that you are the rights holder or
          authorised to act for them.
        </li>
      </ul>
      <p>
        We acknowledge reports within 72 hours. Under the Information Technology (Intermediary
        Guidelines) Rules we act on valid notices within 36 hours where action is possible.
      </p>

      <h2>Circumvention</h2>
      <p>
        Our Unlock PDF tool decrypts a PDF only when the correct password is supplied. We do not
        guess, brute-force or bypass passwords, and we do not strip owner-password restrictions
        without the password — this is a deliberate design decision, not a limitation. Using the
        tool on material you are not authorised to access breaches our{' '}
        <Link to="/terms">terms</Link>.
      </p>

      <h2>Illegal content</h2>
      <p>
        Processing child sexual abuse material or other content that is illegal in India is
        prohibited and will be reported to the appropriate authorities.
      </p>

      <h2>Counter-notice</h2>
      <p>
        If you believe a report about your use was mistaken, write to the same address with your
        reasons and your contact details, and we will review it.
      </p>
    </LegalLayout>
  );
}
