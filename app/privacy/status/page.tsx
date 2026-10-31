import DeletionStatus from "../deletion-status";
export default function PrivacyStatus() {
  return (
    <>
      <p className="eyebrow">ACCOUNT DELETION</p>
      <h1>Deletion request status.</h1>
      <DeletionStatus />
    </>
  );
}
