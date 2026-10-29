import Link from "next/link";
export default function Home() {
  return (
    <>
      <p className="eyebrow">SMART MANUFACTURING OPPORTUNITIES</p>
      <h1>
        Find your next
        <br />
        step forward.
      </h1>
      <p className="intro">
        Scholarships, learning programs and events, matched to your interests
        and the languages you study in.
      </p>
      <div className="notice">
        Local validation preview. The opportunity below is synthetic and cannot
        be applied for.
      </div>
      <section aria-labelledby="opportunities">
        <div className="section-title">
          <h2 id="opportunities">Explore opportunities</h2>
          <span>1 test fixture</span>
        </div>
        <article>
          <div className="tags">
            <span>Online course</span>
            <span>Free participation</span>
          </div>
          <h3>Smart Manufacturing Basics</h3>
          <p>
            Learn the foundations of connected factories, industrial automation
            and digital twins.
          </p>
          <dl>
            <div>
              <dt>Organizer</dt>
              <dd>Synthetic training provider</dd>
            </div>
            <div>
              <dt>Teaching language</dt>
              <dd>English</dd>
            </div>
            <div>
              <dt>Certificate fee</dt>
              <dd>Not stated</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>Not stated</dd>
            </div>
          </dl>
          <Link className="button" href="/matches">
            Sign in to save this fixture
          </Link>
        </article>
      </section>
    </>
  );
}
