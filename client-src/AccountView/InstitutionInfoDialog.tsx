import React, { ReactElement, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { Institution } from 'plaid';
import { DateTime } from 'luxon';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import Http from '@mortvola/http';
import { SubmitButton } from '@mortvola/forms';
import { InstitutionInterface } from '../State/State';
import styles from './InstitutionInfoDialog.module.css';

const Header: React.FC = () => (
  <Modal.Header closeButton>
    <h4 id="modalTitle" className="modal-title">Institution Information</h4>
  </Modal.Header>
);

type FooterProps = {
  setShow: (show: boolean) => void,
  isSubmitting: boolean,
}

const Footer: React.FC<FooterProps> = ({ setShow, isSubmitting }) => (
  <Modal.Footer>
    <div />
    <div />
    <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
    <SubmitButton
      isSubmitting={isSubmitting}
      label="Save"
      submitLabel="Saving"
    />
  </Modal.Footer>
);

type PropsType = {
  institution: InstitutionInterface,
}

const InstitutionInfoDialog: React.FC<PropsType & ModalProps> = ({
  institution,
  setShow,
}) => {
  type InstitutionInfo = Institution; // InstitutionWithInstitutionData & InstitutionWithStatus;

  const [infoInitialized, setInfoInitialized] = useState(false);
  const [info, setInfo] = useState<InstitutionInfo | null>(null);

  if (!infoInitialized) {
    setInfoInitialized(true);

    (async () => {
      const response = await Http.get<InstitutionInfo>(`/api/v1/institution/${institution.id}/info`);

      if (response.ok) {
        const institutionInfo = await response.body();
        setInfo(institutionInfo);
      }
    })();
  }

  const product = (value: string) => {
    const words = value.replace('_', ' ').split(' ');

    return words.map((w) => (
      w[0].toUpperCase() + w.substring(1)
    ))
      .join(' ');
  };

  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

  const renderStatus = (): ReactElement[] | null => {
    if (info && info.status) {
      return Object.entries(info.status)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => (
          <div className={styles.statusItem} key={key}>
            <div>{product(key)}</div>
            <div>{value.status}</div>
            <div>{percent(value.breakdown.success)}</div>
            <div>{percent(value.breakdown.error_plaid)}</div>
            <div>{percent(value.breakdown.error_institution)}</div>
            <div>{DateTime.fromISO(value.last_status_change).toRelative()}</div>
          </div>
        ));
    }

    return null;
  };

  const renderForm = () => {
    if (info) {
      return (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <img src={`data:image/png;base64, ${info.logo}`} alt="logo" width="48" height="48" />
            <div style={{ marginLeft: '1rem' }}>
              <div style={{ fontSize: 'x-large' }}>{info.name}</div>
              {
                info.url
                  ? <a href={info.url} rel="noopener noreferrer" target="_blank">{info.url}</a>
                  : null
              }
            </div>
          </div>
          <div>
            <div className={`${styles.title} ${styles.statusItem}`}>
              <div>Product</div>
              <div>Status</div>
              <div>Success Rate</div>
              <div>Plaid Errors</div>
              <div>Institution Errors</div>
              <div>Last Status Change</div>
            </div>
            {renderStatus()}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <Header />
      <Modal.Body>
        {
          renderForm()
        }
      </Modal.Body>
      <Footer setShow={setShow} isSubmitting={false} />
    </>
  );
};

export const useInstitutionInfoDialog = makeUseModal<PropsType>(InstitutionInfoDialog, { size: 'lg' });

export default InstitutionInfoDialog;
