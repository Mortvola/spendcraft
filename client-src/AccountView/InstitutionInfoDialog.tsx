import React, { ReactElement, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { InstitutionWithInstitutionData, InstitutionWithStatus } from 'plaid';
import { DateTime } from 'luxon';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { httpGet } from '../State/Transports';
import { InstitutionInterface } from '../State/State';
import styles from './InstitutionInfoDialog.module.css';

type PropsType = {
  institution: InstitutionInterface,
}

const InstitutionInfoDialog = ({
  institution,
  setShow,
}: PropsType & ModalProps): ReactElement => {
  const [infoInitialized, setInfoInitialized] = useState(false);
  const [info, setInfo] = useState<InstitutionWithStatus & InstitutionWithInstitutionData | null>(null);

  if (!infoInitialized) {
    setInfoInitialized(true);

    (async () => {
      const response = await httpGet(`/api/institution/${institution.id}/info`);

      if (response.ok) {
        setInfo(await response.json());
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
    if (info && info.status !== undefined) {
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
              <a href={info.url} rel="noopener noreferrer" target="_blank">{info.url}</a>
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

  const Header = () => (
    <Modal.Header closeButton>
      <h4 id="modalTitle" className="modal-title">Institution Information</h4>
    </Modal.Header>
  );

  const Footer = () => (
    <Modal.Footer>
      <div />
      <div />
      <Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <>
      <Header />
      <Modal.Body>
        {
          renderForm()
        }
      </Modal.Body>
      <Footer />
    </>
  );
};

export const useInstitutionInfoDialog = makeUseModal<PropsType>(InstitutionInfoDialog, { size: 'lg' });

export default InstitutionInfoDialog;
