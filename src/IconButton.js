function IconButton(props) {
    
    let className = 'fas fa-' + props.icon;

    return (
        <div className='btn btn-sm group-button' onClick={props.onClick}>
            <i className={className}></i>
        </div>);
}

export default IconButton;
