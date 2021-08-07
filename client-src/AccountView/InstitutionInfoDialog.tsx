import React, { ReactElement, ReactNode, useState } from 'react';
import moment from 'moment';
import { Button, Modal } from 'react-bootstrap';
import useModal, { ModalProps } from '../Modal/useModal';
import Institution from '../state/Institution';
import { InstitutionWithInstitutionData, InstitutionWithStatus } from 'plaid';

type PropsType = {
  institution: Institution,
}

const InstitutionInfoDialog = ({
  institution,
  show,
  onHide,
}: PropsType & ModalProps): ReactElement => {
  const [infoInitialized, setInfoInitialized] = useState(false);
  const [info, setInfo] = useState<InstitutionWithStatus & InstitutionWithInstitutionData | null>(null);

  if (!infoInitialized) {
    setInfoInitialized(true);

    (async () => {
      const response = await fetch(`/api/institution/${institution.id}/info`);

      if (response.ok) {
        setInfo(await response.json());
      }
    })();
  }

  const product = (value: string) => {
    switch (value) {
      case 'auth': return 'AUTH';
      case 'balance': return 'BALANCE';
      case 'identity': return 'IDENTITY';
      case 'item_logins': return 'ITEM ADDS';
      case 'transactions_updates': return 'TRANSACTIONS';
      default: return value;
    }
  };

  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

  const renderStatus = () => {
    const stats: ReactNode[] = [];

    if (info && info.status !== undefined) {
      Object.entries(info.status).forEach(([key, value]) => {
        if (value !== null) {
          stats.push((
            <div className="status-item" key={key}>
              <div>{product(key)}</div>
              <div>{value.status}</div>
              <div>{percent(value.breakdown.success)}</div>
              <div>{percent(value.breakdown.error_plaid)}</div>
              <div>{percent(value.breakdown.error_institution)}</div>
              <div>{moment(value.last_status_change).fromNow()}</div>
            </div>
          ));
        }
      });
    }

    return stats;
  };

  const renderForm = () => {
    if (info) {
      return (
        <div>
          <img src={`data:image/png;base64, ${info.logo}`} alt="logo" width="48" height="48" />
          <a href={info.url} rel="noopener noreferrer" target="_blank">{info.name}</a>
          <div className="status-table">
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
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Header />
      <Modal.Body>
        {
          renderForm()
        }
      </Modal.Body>
      <Footer />
    </Modal>
  );
};

export const useInstitutionInfoDialog = () => useModal(InstitutionInfoDialog);

export default InstitutionInfoDialog;
